// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Injectable, NgZone } from "@angular/core";
import { combineLatest, concatMap, firstValueFrom, map } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { AuthService } from "@bitwarden/common/auth/abstractions/auth.service";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { CryptoFunctionService } from "@bitwarden/common/platform/abstractions/crypto-function.service";
import { EncryptService } from "@bitwarden/common/platform/abstractions/encrypt.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { EncString } from "@bitwarden/common/platform/models/domain/enc-string";
import { SymmetricCryptoKey } from "@bitwarden/common/platform/models/domain/symmetric-crypto-key";
import { UserId } from "@bitwarden/common/types/guid";
import { DialogService } from "@bitwarden/components";
import {
  BiometricStateService,
  BiometricsCommands,
  BiometricsService,
  BiometricsStatus,
  KeyService,
} from "@bitwarden/key-management";

import { BrowserSyncVerificationDialogComponent } from "../app/components/browser-sync-verification-dialog.component";
import { LegacyMessage } from "../models/native-messaging/legacy-message";
import { LegacyMessageWrapper } from "../models/native-messaging/legacy-message-wrapper";
import { DesktopSettingsService } from "../platform/services/desktop-settings.service";

const MessageValidTimeout = 10 * 1000;
const HashAlgorithmForAsymmetricEncryption = "sha1";

type ConnectedApp = {
  publicKey: string;
  sessionSecret: string;
  trusted: boolean;
};

const ConnectedAppPrefix = "connectedApp_";

class ConnectedApps {
  async get(appId: string): Promise<ConnectedApp> {
    if (!(await this.has(appId))) {
      return null;
    }

    return JSON.parse(
      await ipc.platform.ephemeralStore.getEphemeralValue(`${ConnectedAppPrefix}${appId}`),
    );
  }

  async list(): Promise<string[]> {
    return (await ipc.platform.ephemeralStore.listEphemeralValueKeys())
      .filter((key) => key.startsWith(ConnectedAppPrefix))
      .map((key) => key.replace(ConnectedAppPrefix, ""));
  }

  async set(appId: string, value: ConnectedApp) {
    await ipc.platform.ephemeralStore.setEphemeralValue(
      `${ConnectedAppPrefix}${appId}`,
      JSON.stringify(value),
    );
  }

  async has(appId: string) {
    return (await this.list()).find((id) => id === appId) != null;
  }

  async clear() {
    const connected = await this.list();
    for (const appId of connected) {
      await ipc.platform.ephemeralStore.removeEphemeralValue(`${ConnectedAppPrefix}${appId}`);
    }
  }
}

@Injectable()
export class BiometricMessageHandlerService {
  constructor(
    private cryptoFunctionService: CryptoFunctionService,
    private keyService: KeyService,
    private encryptService: EncryptService,
    private logService: LogService,
    private messagingService: MessagingService,
    private desktopSettingService: DesktopSettingsService,
    private biometricStateService: BiometricStateService,
    private biometricsService: BiometricsService,
    private dialogService: DialogService,
    private accountService: AccountService,
    private authService: AuthService,
    private ngZone: NgZone,
    private i18nService: I18nService,
  ) {
    combineLatest([
      this.desktopSettingService.browserIntegrationFingerprintEnabled$,
      this.desktopSettingService.browserIntegrationEnabled$,
    ])
      .pipe(
        concatMap(async () => {
          await this.connectedApps.clear();
        }),
      )
      .subscribe();
  }

  private connectedApps: ConnectedApps = new ConnectedApps();

  async handleMessage(msg: LegacyMessageWrapper) {
    const { appId, message: rawMessage } = msg as LegacyMessageWrapper;

    // Request to setup secure encryption
    if ("command" in rawMessage && rawMessage.command === "setupEncryption") {
      const remotePublicKey = Utils.fromB64ToArray(rawMessage.publicKey);

      // Validate the UserId to ensure we are logged into the same account.
      const accounts = await firstValueFrom(this.accountService.accounts$);
      const userIds = Object.keys(accounts);
      if (!userIds.includes(rawMessage.userId)) {
        this.logService.info(
          "[Native Messaging IPC] Received message for user that is not logged into the desktop app.",
        );
        ipc.platform.nativeMessaging.sendMessage({
          command: "wrongUserId",
          appId: appId,
        });
        return;
      }

      if (await this.connectedApps.has(appId)) {
        this.logService.info(
          "[Native Messaging IPC] Public key for app id changed. Invalidating trust",
        );
      }

      await this.connectedApps.set(appId, {
        publicKey: Utils.fromBufferToB64(remotePublicKey),
        sessionSecret: null,
        trusted: false,
      });
      await this.secureCommunication(remotePublicKey, appId);
      return;
    }

    if ((await this.connectedApps.get(appId))?.sessionSecret == null) {
      this.logService.info(
        "[Native Messaging IPC] Session secret for secure channel is missing. Invalidating encryption...",
      );
      ipc.platform.nativeMessaging.sendMessage({
        command: "invalidateEncryption",
        appId: appId,
      });
      return;
    }

    const message: LegacyMessage = JSON.parse(
      await this.encryptService.decryptToUtf8(
        rawMessage as EncString,
        SymmetricCryptoKey.fromString((await this.connectedApps.get(appId)).sessionSecret),
      ),
    );

    // Shared secret is invalidated, force re-authentication
    if (message == null) {
      this.logService.info(
        "[Native Messaging IPC] Secure channel failed to decrypt message. Invalidating encryption...",
      );
      ipc.platform.nativeMessaging.sendMessage({
        command: "invalidateEncryption",
        appId: appId,
      });
      return;
    }

    if (Math.abs(message.timestamp - Date.now()) > MessageValidTimeout) {
      this.logService.info("[Native Messaging IPC] Received a too old message. Ignoring.");
      return;
    }

    const messageId = message.messageId;

    switch (message.command) {
      case BiometricsCommands.UnlockWithBiometricsForUser: {
        await this.handleUnlockWithBiometricsForUser(message, messageId, appId);
        break;
      }
      case BiometricsCommands.AuthenticateWithBiometrics: {
        try {
          const unlocked = await this.biometricsService.authenticateWithBiometrics();
          await this.send(
            {
              command: BiometricsCommands.AuthenticateWithBiometrics,
              messageId,
              response: unlocked,
            },
            appId,
          );
        } catch (e) {
          this.logService.error("[Native Messaging IPC] Biometric authentication failed", e);
          await this.send(
            { command: BiometricsCommands.AuthenticateWithBiometrics, messageId, response: false },
            appId,
          );
        }
        break;
      }
      case BiometricsCommands.GetBiometricsStatus: {
        const status = await this.biometricsService.getBiometricsStatus();
        return this.send(
          {
            command: BiometricsCommands.GetBiometricsStatus,
            messageId,
            response: status,
          },
          appId,
        );
      }
      case BiometricsCommands.GetBiometricsStatusForUser: {
        let status = await this.biometricsService.getBiometricsStatusForUser(
          message.userId as UserId,
        );
        if (status == BiometricsStatus.NotEnabledLocally) {
          status = BiometricsStatus.NotEnabledInConnectedDesktopApp;
        }
        return this.send(
          {
            command: BiometricsCommands.GetBiometricsStatusForUser,
            messageId,
            response: status,
          },
          appId,
        );
      }
      // TODO: legacy, remove after 2025.3
      case BiometricsCommands.IsAvailable: {
        const available =
          (await this.biometricsService.getBiometricsStatus()) == BiometricsStatus.Available;
        return this.send(
          {
            command: BiometricsCommands.IsAvailable,
            response: available ? "available" : "not available",
          },
          appId,
        );
      }
      // TODO: legacy, remove after 2025.3
      case BiometricsCommands.Unlock: {
        if (
          await firstValueFrom(this.desktopSettingService.browserIntegrationFingerprintEnabled$)
        ) {
          await this.send({ command: "biometricUnlock", response: "not available" }, appId);
          await this.dialogService.openSimpleDialog({
            title: this.i18nService.t("updateBrowserOrDisableFingerprintDialogTitle"),
            content: this.i18nService.t("updateBrowserOrDisableFingerprintDialogMessage"),
            type: "warning",
          });
          return;
        }

        const isTemporarilyDisabled =
          (await this.biometricStateService.getBiometricUnlockEnabled(message.userId as UserId)) &&
          !((await this.biometricsService.getBiometricsStatus()) == BiometricsStatus.Available);
        if (isTemporarilyDisabled) {
          return this.send({ command: "biometricUnlock", response: "not available" }, appId);
        }

        if (!((await this.biometricsService.getBiometricsStatus()) == BiometricsStatus.Available)) {
          return this.send({ command: "biometricUnlock", response: "not supported" }, appId);
        }

        const userId =
          (message.userId as UserId) ??
          (await firstValueFrom(this.accountService.activeAccount$.pipe(map((a) => a?.id))));

        if (userId == null) {
          return this.send({ command: "biometricUnlock", response: "not unlocked" }, appId);
        }

        const biometricUnlockPromise =
          message.userId == null
            ? firstValueFrom(this.biometricStateService.biometricUnlockEnabled$)
            : this.biometricStateService.getBiometricUnlockEnabled(message.userId as UserId);
        if (!(await biometricUnlockPromise)) {
          await this.send({ command: "biometricUnlock", response: "not enabled" }, appId);

          return this.ngZone.run(() =>
            this.dialogService.openSimpleDialog({
              type: "warning",
              title: { key: "biometricsNotEnabledTitle" },
              content: { key: "biometricsNotEnabledDesc" },
              cancelButtonText: null,
              acceptButtonText: { key: "cancel" },
            }),
          );
        }

        try {
          const userKey = await this.biometricsService.unlockWithBiometricsForUser(userId);

          if (userKey != null) {
            await this.send(
              {
                command: "biometricUnlock",
                response: "unlocked",
                userKeyB64: userKey.keyB64,
              },
              appId,
            );

            const currentlyActiveAccountId = (
              await firstValueFrom(this.accountService.activeAccount$)
            ).id;
            const isCurrentlyActiveAccountUnlocked =
              (await this.authService.getAuthStatus(userId)) == AuthenticationStatus.Unlocked;

            // prevent proc reloading an active account, when it is the same as the browser
            if (currentlyActiveAccountId != message.userId || !isCurrentlyActiveAccountUnlocked) {
              await ipc.platform.reloadProcess();
            }
          } else {
            await this.send({ command: "biometricUnlock", response: "canceled" }, appId);
          }
          // FIXME: Remove when updating file. Eslint update
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          await this.send({ command: "biometricUnlock", response: "canceled" }, appId);
        }
        break;
      }
      default:
        this.logService.error("NativeMessage, got unknown command: " + message.command);
        break;
    }
  }

  private async send(message: any, appId: string) {
    message.timestamp = Date.now();

    const encrypted = await this.encryptService.encrypt(
      JSON.stringify(message),
      SymmetricCryptoKey.fromString((await this.connectedApps.get(appId)).sessionSecret),
    );

    ipc.platform.nativeMessaging.sendMessage({
      appId: appId,
      messageId: message.messageId,
      message: encrypted,
    });
  }

  private async secureCommunication(remotePublicKey: Uint8Array, appId: string) {
    const secret = await this.cryptoFunctionService.randomBytes(64);
    const connectedApp = await this.connectedApps.get(appId);
    connectedApp.sessionSecret = new SymmetricCryptoKey(secret).keyB64;
    await this.connectedApps.set(appId, connectedApp);

    this.logService.info("[Native Messaging IPC] Setting up secure channel");
    const encryptedSecret = await this.cryptoFunctionService.rsaEncrypt(
      secret,
      remotePublicKey,
      HashAlgorithmForAsymmetricEncryption,
    );
    ipc.platform.nativeMessaging.sendMessage({
      appId: appId,
      command: "setupEncryption",
      messageId: -1, // to indicate to the other side that this is a new desktop client. refactor later to use proper versioning
      sharedSecret: Utils.fromBufferToB64(encryptedSecret),
    });
  }

  private async handleUnlockWithBiometricsForUser(
    message: LegacyMessage,
    messageId: number,
    appId: string,
  ) {
    const messageUserId = message.userId as UserId;
    if (!(await this.validateFingerprint(appId))) {
      await this.send(
        {
          command: BiometricsCommands.UnlockWithBiometricsForUser,
          messageId,
          response: false,
        },
        appId,
      );
      return;
    }

    try {
      const userKey = await this.biometricsService.unlockWithBiometricsForUser(messageUserId);
      if (userKey != null) {
        this.logService.info("[Native Messaging IPC] Biometric unlock for user: " + messageUserId);
        await this.send(
          {
            command: BiometricsCommands.UnlockWithBiometricsForUser,
            response: true,
            messageId,
            userKeyB64: userKey.keyB64,
          },
          appId,
        );
        await this.processReloadWhenRequired(messageUserId);
      } else {
        await this.send(
          {
            command: BiometricsCommands.UnlockWithBiometricsForUser,
            messageId,
            response: false,
          },
          appId,
        );
      }
      // FIXME: Remove when updating file. Eslint update
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      await this.send(
        { command: BiometricsCommands.UnlockWithBiometricsForUser, messageId, response: false },
        appId,
      );
    }
  }

  /** A process reload after a biometric unlock should happen if the userkey that was used for biometric unlock is for a different user than the
   * currently active account. The userkey for the active account was in memory anyways. Further, if the desktop app is locked, a reload should occur (since the userkey was not already in memory).
   */
  async processReloadWhenRequired(messageUserId: UserId) {
    const currentlyActiveAccountId = (await firstValueFrom(this.accountService.activeAccount$)).id;
    const isCurrentlyActiveAccountUnlocked =
      (await firstValueFrom(this.authService.authStatusFor$(currentlyActiveAccountId))) ==
      AuthenticationStatus.Unlocked;

    if (currentlyActiveAccountId !== messageUserId || !isCurrentlyActiveAccountUnlocked) {
      if (!ipc.platform.isDev) {
        ipc.platform.reloadProcess();
      }
    }
  }

  async validateFingerprint(appId: string): Promise<boolean> {
    if (await firstValueFrom(this.desktopSettingService.browserIntegrationFingerprintEnabled$)) {
      const appToValidate = await this.connectedApps.get(appId);
      if (appToValidate == null) {
        return false;
      }

      if (appToValidate.trusted) {
        return true;
      }

      ipc.platform.nativeMessaging.sendMessage({
        command: "verifyDesktopIPCFingerprint",
        appId: appId,
      });

      const fingerprint = await this.keyService.getFingerprint(
        appId,
        Utils.fromB64ToArray(appToValidate.publicKey),
      );

      this.messagingService.send("setFocus");

      const dialogRef = this.ngZone.run(() =>
        BrowserSyncVerificationDialogComponent.open(this.dialogService, { fingerprint }),
      );

      const browserSyncVerified = await firstValueFrom(dialogRef.closed);
      if (browserSyncVerified !== true) {
        this.logService.info("[Native Messaging IPC] Fingerprint verification failed.");
        ipc.platform.nativeMessaging.sendMessage({
          command: "rejectedDesktopIPCFingerprint",
          appId: appId,
        });
        return false;
      } else {
        this.logService.info("[Native Messaging IPC] Fingerprint verified.");
        ipc.platform.nativeMessaging.sendMessage({
          command: "verifiedDesktopIPCFingerprint",
          appId: appId,
        });
      }

      appToValidate.trusted = true;
      await this.connectedApps.set(appId, appToValidate);
    }

    return true;
  }
}
