// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { CommonModule, Location } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { AvatarModule, ItemModule } from "@bitwarden/components";

import { AccountSwitcherService, AvailableAccount } from "./services/account-switcher.service";

@Component({
  standalone: true,
  selector: "auth-account",
  templateUrl: "account.component.html",
  imports: [CommonModule, JslibModule, AvatarModule, ItemModule],
})
export class AccountComponent {
  @Input() account: AvailableAccount;
  @Output() loading = new EventEmitter<boolean>();

  constructor(
    private accountSwitcherService: AccountSwitcherService,
    private location: Location,
    private i18nService: I18nService,
    private logService: LogService,
  ) {}

  get specialAccountAddId() {
    return this.accountSwitcherService.SPECIAL_ADD_ACCOUNT_ID;
  }

  async selectAccount(id: string) {
    this.loading.emit(true);
    let result;
    try {
      result = await this.accountSwitcherService.selectAccount(id);
    } catch (e) {
      this.logService.error("Error selecting account", e);
    }

    // Navigate out of account switching for unlocked accounts
    // locked or logged out account statuses are handled by background and app.component
    if (result?.status === AuthenticationStatus.Unlocked) {
      this.location.back();
    }
    this.loading.emit(false);
  }

  get status() {
    if (this.account.isActive) {
      return { text: this.i18nService.t("active"), icon: "bwi-check-circle" };
    }

    if (this.account.status === AuthenticationStatus.Unlocked) {
      return { text: this.i18nService.t("unlocked"), icon: "bwi-unlock" };
    }

    return { text: this.i18nService.t("locked"), icon: "bwi-lock" };
  }
}
