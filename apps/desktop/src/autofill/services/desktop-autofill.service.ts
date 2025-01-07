import { Injectable, OnDestroy } from "@angular/core";
import { autofill } from "desktop_native/napi";
import {
  EMPTY,
  Subject,
  distinctUntilChanged,
  firstValueFrom,
  map,
  mergeMap,
  switchMap,
  takeUntil,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { UriMatchStrategy } from "@bitwarden/common/models/domain/domain-service";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import {
  Fido2AuthenticatorGetAssertionParams,
  Fido2AuthenticatorGetAssertionResult,
  Fido2AuthenticatorMakeCredentialResult,
  Fido2AuthenticatorMakeCredentialsParams,
  Fido2AuthenticatorService as Fido2AuthenticatorServiceAbstraction,
} from "@bitwarden/common/platform/abstractions/fido2/fido2-authenticator.service.abstraction";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { getCredentialsForAutofill } from "@bitwarden/common/platform/services/fido2/fido2-autofill-utils";
import { Fido2Utils } from "@bitwarden/common/platform/services/fido2/fido2-utils";
import { guidToRawFormat } from "@bitwarden/common/platform/services/fido2/guid-utils";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";

import { NativeAutofillStatusCommand } from "../../platform/main/autofill/status.command";
import {
  NativeAutofillFido2Credential,
  NativeAutofillPasswordCredential,
  NativeAutofillSyncCommand,
} from "../../platform/main/autofill/sync.command";

@Injectable()
export class DesktopAutofillService implements OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(
    private logService: LogService,
    private cipherService: CipherService,
    private configService: ConfigService,
    private fido2AuthenticatorService: Fido2AuthenticatorServiceAbstraction<void>,
    private accountService: AccountService,
  ) {}

  async init() {
    this.configService
      .getFeatureFlag$(FeatureFlag.MacOsNativeCredentialSync)
      .pipe(
        distinctUntilChanged(),
        switchMap((enabled) => {
          if (!enabled) {
            return EMPTY;
          }

          return this.cipherService.cipherViews$;
        }),
        // TODO: This will unset all the autofill credentials on the OS
        // when the account locks. We should instead explicilty clear the credentials
        // when the user logs out. Maybe by subscribing to the encrypted ciphers observable instead.
        mergeMap((cipherViewMap) => this.sync(Object.values(cipherViewMap ?? []))),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.listenIpc();
  }

  /** Give metadata about all available credentials in the users vault */
  async sync(cipherViews: CipherView[]) {
    const status = await this.status();
    if (status.type === "error") {
      return this.logService.error("Error getting autofill status", status.error);
    }

    if (!status.value.state.enabled) {
      // Autofill is disabled
      return;
    }

    let fido2Credentials: NativeAutofillFido2Credential[];
    let passwordCredentials: NativeAutofillPasswordCredential[];

    if (status.value.support.password) {
      passwordCredentials = cipherViews
        .filter(
          (cipher) =>
            cipher.type === CipherType.Login &&
            cipher.login.uris?.length > 0 &&
            cipher.login.uris.some((uri) => uri.match !== UriMatchStrategy.Never) &&
            cipher.login.uris.some((uri) => !Utils.isNullOrWhitespace(uri.uri)) &&
            !Utils.isNullOrWhitespace(cipher.login.username),
        )
        .map((cipher) => ({
          type: "password",
          cipherId: cipher.id,
          uri: cipher.login.uris.find((uri) => uri.match !== UriMatchStrategy.Never).uri,
          username: cipher.login.username,
        }));
    }

    if (status.value.support.fido2) {
      fido2Credentials = (await getCredentialsForAutofill(cipherViews)).map((credential) => ({
        type: "fido2",
        ...credential,
      }));
    }

    const syncResult = await ipc.autofill.runCommand<NativeAutofillSyncCommand>({
      namespace: "autofill",
      command: "sync",
      params: {
        credentials: [...fido2Credentials, ...passwordCredentials],
      },
    });

    if (syncResult.type === "error") {
      return this.logService.error("Error syncing autofill credentials", syncResult.error);
    }

    this.logService.debug(`Synced ${syncResult.value.added} autofill credentials`);
  }

  /** Get autofill status from OS */
  private status() {
    // TODO: Investigate why this type needs to be explicitly set
    return ipc.autofill.runCommand<NativeAutofillStatusCommand>({
      namespace: "autofill",
      command: "status",
      params: {},
    });
  }

  listenIpc() {
    ipc.autofill.listenPasskeyRegistration((clientId, sequenceNumber, request, callback) => {
      this.logService.warning("listenPasskeyRegistration", clientId, sequenceNumber, request);
      this.logService.warning(
        "listenPasskeyRegistration2",
        this.convertRegistrationRequest(request),
      );

      const controller = new AbortController();
      void this.fido2AuthenticatorService
        .makeCredential(this.convertRegistrationRequest(request), null, controller)
        .then((response) => {
          callback(null, this.convertRegistrationResponse(request, response));
        })
        .catch((error) => {
          this.logService.error("listenPasskeyRegistration error", error);
          callback(error, null);
        });
    });

    ipc.autofill.listenPasskeyAssertion(async (clientId, sequenceNumber, request, callback) => {
      this.logService.warning("listenPasskeyAssertion", clientId, sequenceNumber, request);

      // TODO: For some reason the credentialId is passed as an empty array in the request, so we need to
      // get it from the cipher. For that we use the recordIdentifier, which is the cipherId.
      if (request.recordIdentifier && request.credentialId.length === 0) {
        const cipher = await this.cipherService.get(request.recordIdentifier);
        if (!cipher) {
          this.logService.error("listenPasskeyAssertion error", "Cipher not found");
          callback(new Error("Cipher not found"), null);
          return;
        }

        const activeUserId = await firstValueFrom(
          this.accountService.activeAccount$.pipe(map((a) => a?.id)),
        );

        const decrypted = await cipher.decrypt(
          await this.cipherService.getKeyForCipherKeyDecryption(cipher, activeUserId),
        );

        const fido2Credential = decrypted.login.fido2Credentials?.[0];
        if (!fido2Credential) {
          this.logService.error("listenPasskeyAssertion error", "Fido2Credential not found");
          callback(new Error("Fido2Credential not found"), null);
          return;
        }

        request.credentialId = Array.from(
          guidToRawFormat(decrypted.login.fido2Credentials?.[0].credentialId),
        );
      }

      const controller = new AbortController();
      void this.fido2AuthenticatorService
        .getAssertion(this.convertAssertionRequest(request), null, controller)
        .then((response) => {
          callback(null, this.convertAssertionResponse(request, response));
        })
        .catch((error) => {
          this.logService.error("listenPasskeyAssertion error", error);
          callback(error, null);
        });
    });
  }

  private convertRegistrationRequest(
    request: autofill.PasskeyRegistrationRequest,
  ): Fido2AuthenticatorMakeCredentialsParams {
    return {
      hash: new Uint8Array(request.clientDataHash),
      rpEntity: {
        name: request.rpId,
        id: request.rpId,
      },
      userEntity: {
        id: new Uint8Array(request.userHandle),
        name: request.userName,
        displayName: undefined,
        icon: undefined,
      },
      credTypesAndPubKeyAlgs: request.supportedAlgorithms.map((alg) => ({
        alg,
        type: "public-key",
      })),
      excludeCredentialDescriptorList: [],
      requireResidentKey: true,
      requireUserVerification:
        request.userVerification === "required" || request.userVerification === "preferred",
      fallbackSupported: false,
    };
  }

  private convertRegistrationResponse(
    request: autofill.PasskeyRegistrationRequest,
    response: Fido2AuthenticatorMakeCredentialResult,
  ): autofill.PasskeyRegistrationResponse {
    return {
      rpId: request.rpId,
      clientDataHash: request.clientDataHash,
      credentialId: Array.from(Fido2Utils.bufferSourceToUint8Array(response.credentialId)),
      attestationObject: Array.from(
        Fido2Utils.bufferSourceToUint8Array(response.attestationObject),
      ),
    };
  }

  private convertAssertionRequest(
    request: autofill.PasskeyAssertionRequest,
  ): Fido2AuthenticatorGetAssertionParams {
    return {
      rpId: request.rpId,
      hash: new Uint8Array(request.clientDataHash),
      allowCredentialDescriptorList: [
        {
          id: new Uint8Array(request.credentialId),
          type: "public-key",
        },
      ],
      extensions: {},
      requireUserVerification:
        request.userVerification === "required" || request.userVerification === "preferred",
      fallbackSupported: false,
    };
  }

  private convertAssertionResponse(
    request: autofill.PasskeyAssertionRequest,
    response: Fido2AuthenticatorGetAssertionResult,
  ): autofill.PasskeyAssertionResponse {
    return {
      userHandle: Array.from(response.selectedCredential.userHandle),
      rpId: request.rpId,
      signature: Array.from(response.signature),
      clientDataHash: request.clientDataHash,
      authenticatorData: Array.from(response.authenticatorData),
      credentialId: Array.from(response.selectedCredential.id),
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
