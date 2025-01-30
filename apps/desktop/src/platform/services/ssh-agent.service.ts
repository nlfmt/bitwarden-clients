// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Injectable, OnDestroy } from "@angular/core";
import {
  catchError,
  combineLatest,
  concatMap,
  EMPTY,
  filter,
  firstValueFrom,
  from,
  map,
  of,
  skip,
  Subject,
  switchMap,
  takeUntil,
  timeout,
  TimeoutError,
  timer,
  withLatestFrom,
} from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CommandDefinition, MessageListener } from "@bitwarden/common/platform/messaging";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { DialogService, ToastService } from "@bitwarden/components";

import { ApproveSshRequestComponent } from "../components/approve-ssh-request";

import { DesktopSettingsService } from "./desktop-settings.service";

@Injectable({
  providedIn: "root",
})
export class SshAgentService implements OnDestroy {
  SSH_REFRESH_INTERVAL = 1000;
  SSH_VAULT_UNLOCK_REQUEST_TIMEOUT = 60_000;
  SSH_REQUEST_UNLOCK_POLLING_INTERVAL = 100;

  private isFeatureFlagEnabled = false;

  private destroy$ = new Subject<void>();

  constructor(
    private cipherService: CipherService,
    private logService: LogService,
    private dialogService: DialogService,
    private messageListener: MessageListener,
    private authService: AuthService,
    private toastService: ToastService,
    private i18nService: I18nService,
    private desktopSettingsService: DesktopSettingsService,
    private configService: ConfigService,
    private accountService: AccountService,
  ) {}

  async init() {
    this.configService
      .getFeatureFlag$(FeatureFlag.SSHAgent)
      .pipe(
        concatMap(async (enabled) => {
          this.isFeatureFlagEnabled = enabled;
          if (!(await ipc.platform.sshAgent.isLoaded()) && enabled) {
            await ipc.platform.sshAgent.init();
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    await this.initListeners();
  }

  private async initListeners() {
    this.messageListener
      .messages$(new CommandDefinition("sshagent.signrequest"))
      .pipe(
        withLatestFrom(this.desktopSettingsService.sshAgentEnabled$),
        concatMap(async ([message, enabled]) => {
          if (!enabled) {
            await ipc.platform.sshAgent.signRequestResponse(message.requestId as number, false);
          }
          return { message, enabled };
        }),
        filter(({ enabled }) => enabled),
        map(({ message }) => message),
        withLatestFrom(this.authService.activeAccountStatus$),
        // This switchMap handles unlocking the vault if it is locked:
        //   - If the vault is locked, we will wait for it to be unlocked.
        //   - If the vault is not unlocked within the timeout, we will abort the flow.
        //   - If the vault is unlocked, we will continue with the flow.
        // switchMap is used here to prevent multiple requests from being processed at the same time,
        // and will cancel the previous request if a new one is received.
        switchMap(([message, status]) => {
          if (status !== AuthenticationStatus.Unlocked) {
            ipc.platform.focusWindow();
            this.toastService.showToast({
              variant: "info",
              title: null,
              message: this.i18nService.t("sshAgentUnlockRequired"),
            });
            return this.authService.activeAccountStatus$.pipe(
              filter((status) => status === AuthenticationStatus.Unlocked),
              timeout({
                first: this.SSH_VAULT_UNLOCK_REQUEST_TIMEOUT,
              }),
              catchError((error: unknown) => {
                if (error instanceof TimeoutError) {
                  this.toastService.showToast({
                    variant: "error",
                    title: null,
                    message: this.i18nService.t("sshAgentUnlockTimeout"),
                  });
                  const requestId = message.requestId as number;
                  // Abort flow by sending a false response.
                  // Returning an empty observable this will prevent the rest of the flow from executing
                  return from(ipc.platform.sshAgent.signRequestResponse(requestId, false)).pipe(
                    map(() => EMPTY),
                  );
                }

                throw error;
              }),
              map(() => message),
            );
          }

          return of(message);
        }),
        // This switchMap handles fetching the ciphers from the vault.
        switchMap((message) =>
          from(this.cipherService.getAllDecrypted()).pipe(
            map((ciphers) => [message, ciphers] as const),
          ),
        ),
        // This concatMap handles showing the dialog to approve the request.
        concatMap(async ([message, ciphers]) => {
          const cipherId = message.cipherId as string;
          const isListRequest = message.isListRequest as boolean;
          const requestId = message.requestId as number;
          let application = message.processName as string;
          if (application == "") {
            application = this.i18nService.t("unknownApplication");
          }

          if (isListRequest) {
            const sshCiphers = ciphers.filter(
              (cipher) => cipher.type === CipherType.SshKey && !cipher.isDeleted,
            );
            const keys = sshCiphers.map((cipher) => {
              return {
                name: cipher.name,
                privateKey: cipher.sshKey.privateKey,
                cipherId: cipher.id,
              };
            });
            await ipc.platform.sshAgent.setKeys(keys);
            await ipc.platform.sshAgent.signRequestResponse(requestId, true);
            return;
          }

          if (ciphers === undefined) {
            ipc.platform.sshAgent
              .signRequestResponse(requestId, false)
              .catch((e) => this.logService.error("Failed to respond to SSH request", e));
          }

          const cipher = ciphers.find((cipher) => cipher.id == cipherId);

          ipc.platform.focusWindow();
          const dialogRef = ApproveSshRequestComponent.open(
            this.dialogService,
            cipher.name,
            application,
          );

          const result = await firstValueFrom(dialogRef.closed);
          return ipc.platform.sshAgent.signRequestResponse(requestId, result);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.accountService.activeAccount$.pipe(skip(1), takeUntil(this.destroy$)).subscribe({
      next: (account) => {
        if (!this.isFeatureFlagEnabled) {
          return;
        }

        this.logService.info("Active account changed, clearing SSH keys");
        ipc.platform.sshAgent
          .clearKeys()
          .catch((e) => this.logService.error("Failed to clear SSH keys", e));
      },
      error: (e: unknown) => {
        if (!this.isFeatureFlagEnabled) {
          return;
        }

        this.logService.error("Error in active account observable", e);
        ipc.platform.sshAgent
          .clearKeys()
          .catch((e) => this.logService.error("Failed to clear SSH keys", e));
      },
      complete: () => {
        if (!this.isFeatureFlagEnabled) {
          return;
        }

        this.logService.info("Active account observable completed, clearing SSH keys");
        ipc.platform.sshAgent
          .clearKeys()
          .catch((e) => this.logService.error("Failed to clear SSH keys", e));
      },
    });

    combineLatest([
      timer(0, this.SSH_REFRESH_INTERVAL),
      this.desktopSettingsService.sshAgentEnabled$,
    ])
      .pipe(
        concatMap(async ([, enabled]) => {
          if (!this.isFeatureFlagEnabled) {
            return;
          }

          if (!enabled) {
            await ipc.platform.sshAgent.clearKeys();
            return;
          }

          const activeAccount = await firstValueFrom(this.accountService.activeAccount$);
          const authStatus = await firstValueFrom(
            this.authService.authStatusFor$(activeAccount.id),
          );
          if (authStatus !== AuthenticationStatus.Unlocked) {
            return;
          }

          const ciphers = await this.cipherService.getAllDecrypted();
          if (ciphers == null) {
            await ipc.platform.sshAgent.lock();
            return;
          }

          const sshCiphers = ciphers.filter(
            (cipher) =>
              cipher.type === CipherType.SshKey &&
              !cipher.isDeleted &&
              cipher.organizationId === null,
          );
          const keys = sshCiphers.map((cipher) => {
            return {
              name: cipher.name,
              privateKey: cipher.sshKey.privateKey,
              cipherId: cipher.id,
            };
          });
          await ipc.platform.sshAgent.setKeys(keys);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
