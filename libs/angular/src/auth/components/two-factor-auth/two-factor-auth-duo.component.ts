// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { DialogModule } from "@angular/cdk/dialog";
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { ReactiveFormsModule, FormsModule } from "@angular/forms";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { I18nPipe } from "@bitwarden/angular/platform/pipes/i18n.pipe";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import {
  ButtonModule,
  LinkModule,
  TypographyModule,
  FormFieldModule,
  AsyncActionsModule,
  ToastService,
} from "@bitwarden/components";

@Component({
  standalone: true,
  selector: "app-two-factor-auth-duo",
  templateUrl: "two-factor-auth-duo.component.html",
  imports: [
    CommonModule,
    JslibModule,
    DialogModule,
    ButtonModule,
    LinkModule,
    TypographyModule,
    ReactiveFormsModule,
    FormFieldModule,
    AsyncActionsModule,
    FormsModule,
  ],
  providers: [I18nPipe],
})
export class TwoFactorAuthDuoComponent implements OnInit {
  @Output() token = new EventEmitter<string>();
  @Input() providerData: any;

  duoFramelessUrl: string = null;
  duoResultListenerInitialized = false;

  constructor(
    protected i18nService: I18nService,
    protected platformUtilsService: PlatformUtilsService,
    protected toastService: ToastService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.init();
  }

  async init() {
    // Setup listener for duo-redirect.ts connector to send back the code
    if (!this.duoResultListenerInitialized) {
      // setup client specific duo result listener
      this.setupDuoResultListener();
      this.duoResultListenerInitialized = true;
    }

    // flow must be launched by user so they can choose to remember the device or not.
    this.duoFramelessUrl = this.providerData.AuthUrl;
  }

  // Each client will have own implementation
  protected setupDuoResultListener(): void {}
  async launchDuoFrameless(): Promise<void> {
    if (this.duoFramelessUrl === null) {
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("duoHealthCheckResultsInNullAuthUrlError"),
      });
      return;
    }
    this.platformUtilsService.launchUri(this.duoFramelessUrl);
  }
}
