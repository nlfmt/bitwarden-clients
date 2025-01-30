// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { DatePipe } from "@angular/common";
import { Component, OnInit } from "@angular/core";

import { CollectionService } from "@bitwarden/admin-console/common";
import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { EventCollectionService } from "@bitwarden/common/abstractions/event/event-collection.service";
import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { PolicyService } from "@bitwarden/common/admin-console/abstractions/policy/policy.service.abstraction";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { BillingAccountProfileStateService } from "@bitwarden/common/billing/abstractions/account/billing-account-profile-state.service";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { MessagingService } from "@bitwarden/common/platform/abstractions/messaging.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { FolderService } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { TotpService } from "@bitwarden/common/vault/abstractions/totp.service";
import { Cipher } from "@bitwarden/common/vault/models/domain/cipher";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";
import { DialogService, ToastService } from "@bitwarden/components";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";
import { PasswordRepromptService } from "@bitwarden/vault";

import { AddEditComponent as BaseAddEditComponent } from "../../../../vault/individual-vault/add-edit.component";

@Component({
  selector: "app-org-vault-add-edit",
  templateUrl: "../../../../vault/individual-vault/add-edit.component.html",
})
export class EmergencyAddEditCipherComponent extends BaseAddEditComponent implements OnInit {
  originalCipher: Cipher = null;
  viewOnly = true;
  protected override componentName = "app-org-vault-add-edit";

  constructor(
    cipherService: CipherService,
    folderService: FolderService,
    i18nService: I18nService,
    platformUtilsService: PlatformUtilsService,
    auditService: AuditService,
    accountService: AccountService,
    collectionService: CollectionService,
    totpService: TotpService,
    passwordGenerationService: PasswordGenerationServiceAbstraction,
    messagingService: MessagingService,
    eventCollectionService: EventCollectionService,
    policyService: PolicyService,
    passwordRepromptService: PasswordRepromptService,
    organizationService: OrganizationService,
    logService: LogService,
    dialogService: DialogService,
    datePipe: DatePipe,
    configService: ConfigService,
    billingAccountProfileStateService: BillingAccountProfileStateService,
    cipherAuthorizationService: CipherAuthorizationService,
    toastService: ToastService,
    sdkService: SdkService,
  ) {
    super(
      cipherService,
      folderService,
      i18nService,
      platformUtilsService,
      auditService,
      accountService,
      collectionService,
      totpService,
      passwordGenerationService,
      messagingService,
      eventCollectionService,
      policyService,
      organizationService,
      logService,
      passwordRepromptService,
      dialogService,
      datePipe,
      configService,
      billingAccountProfileStateService,
      cipherAuthorizationService,
      toastService,
      sdkService,
    );
  }

  async load() {
    this.title = this.i18nService.t("viewItem");
  }

  async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    // The base component `ngOnInit` calculates the `viewOnly` property based on cipher properties
    // In the case of emergency access, `viewOnly` should always be true, set it manually here after
    // the base `ngOnInit` is complete.
    this.viewOnly = true;
  }

  protected async loadCipher() {
    return Promise.resolve(this.originalCipher);
  }
}
