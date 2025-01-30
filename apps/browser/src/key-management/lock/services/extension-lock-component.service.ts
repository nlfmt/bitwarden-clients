// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { inject } from "@angular/core";
import { combineLatest, defer, firstValueFrom, map, Observable } from "rxjs";

import {
  PinServiceAbstraction,
  UserDecryptionOptionsServiceAbstraction,
} from "@bitwarden/auth/common";
import { UserId } from "@bitwarden/common/types/guid";
import {
  BiometricsService,
  BiometricsStatus,
  BiometricStateService,
} from "@bitwarden/key-management";
import { LockComponentService, UnlockOptions } from "@bitwarden/key-management-ui";

import { BiometricErrors, BiometricErrorTypes } from "../../../models/biometricErrors";
import { BrowserRouterService } from "../../../platform/popup/services/browser-router.service";

export class ExtensionLockComponentService implements LockComponentService {
  private readonly userDecryptionOptionsService = inject(UserDecryptionOptionsServiceAbstraction);
  private readonly biometricsService = inject(BiometricsService);
  private readonly pinService = inject(PinServiceAbstraction);
  private readonly routerService = inject(BrowserRouterService);
  private readonly biometricStateService = inject(BiometricStateService);

  getPreviousUrl(): string | null {
    return this.routerService.getPreviousUrl();
  }

  getBiometricsError(error: any): string | null {
    const biometricsError = BiometricErrors[error?.message as BiometricErrorTypes];

    if (!biometricsError) {
      return null;
    }

    return biometricsError.description;
  }

  async isWindowVisible(): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  getBiometricsUnlockBtnText(): string {
    return "unlockWithBiometrics";
  }

  getAvailableUnlockOptions$(userId: UserId): Observable<UnlockOptions> {
    return combineLatest([
      // Note: defer is preferable b/c it delays the execution of the function until the observable is subscribed to
      defer(async () => {
        if (!(await firstValueFrom(this.biometricStateService.biometricUnlockEnabled$))) {
          return BiometricsStatus.NotEnabledLocally;
        } else {
          // TODO remove after 2025.3
          // remove after backward compatibility code for old biometrics ipc protocol is removed
          const result: BiometricsStatus = (await Promise.race([
            this.biometricsService.getBiometricsStatusForUser(userId),
            new Promise((resolve) =>
              setTimeout(() => resolve(BiometricsStatus.DesktopDisconnected), 1000),
            ),
          ])) as BiometricsStatus;
          return result;
        }
      }),
      this.userDecryptionOptionsService.userDecryptionOptionsById$(userId),
      defer(() => this.pinService.isPinDecryptionAvailable(userId)),
    ]).pipe(
      map(([biometricsStatus, userDecryptionOptions, pinDecryptionAvailable]) => {
        const unlockOpts: UnlockOptions = {
          masterPassword: {
            enabled: userDecryptionOptions.hasMasterPassword,
          },
          pin: {
            enabled: pinDecryptionAvailable,
          },
          biometrics: {
            enabled: biometricsStatus === BiometricsStatus.Available,
            biometricsStatus: biometricsStatus,
          },
        };
        return unlockOpts;
      }),
    );
  }
}
