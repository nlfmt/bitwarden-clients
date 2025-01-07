// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom, map, Observable, switchMap } from "rxjs";

import { CollectionView } from "@bitwarden/admin-console/common";
import { JslibModule } from "@bitwarden/angular/jslib.module";
import { EventCollectionService } from "@bitwarden/common/abstractions/event/event-collection.service";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import {
  AUTOFILL_ID,
  COPY_PASSWORD_ID,
  COPY_USERNAME_ID,
  COPY_VERIFICATION_CODE_ID,
  SHOW_AUTOFILL_BUTTON,
} from "@bitwarden/common/autofill/constants";
import { EventType } from "@bitwarden/common/enums";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { ViewPasswordHistoryService } from "@bitwarden/common/vault/abstractions/view-password-history.service";
import { CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { CipherAuthorizationService } from "@bitwarden/common/vault/services/cipher-authorization.service";
import {
  AsyncActionsModule,
  ButtonModule,
  DialogService,
  IconButtonModule,
  SearchModule,
  ToastService,
} from "@bitwarden/components";
import { CopyCipherFieldService } from "@bitwarden/vault";

import { PremiumUpgradePromptService } from "../../../../../../../../libs/common/src/vault/abstractions/premium-upgrade-prompt.service";
import { CipherViewComponent } from "../../../../../../../../libs/vault/src/cipher-view";
import { BrowserApi } from "../../../../../platform/browser/browser-api";
import BrowserPopupUtils from "../../../../../platform/popup/browser-popup-utils";
import { PopOutComponent } from "../../../../../platform/popup/components/pop-out.component";
import { PopupRouterCacheService } from "../../../../../platform/popup/view-cache/popup-router-cache.service";
import { BrowserPremiumUpgradePromptService } from "../../../services/browser-premium-upgrade-prompt.service";
import { BrowserViewPasswordHistoryService } from "../../../services/browser-view-password-history.service";
import { closeViewVaultItemPopout, VaultPopoutType } from "../../../utils/vault-popout-window";

import { PopupFooterComponent } from "./../../../../../platform/popup/layout/popup-footer.component";
import { PopupHeaderComponent } from "./../../../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "./../../../../../platform/popup/layout/popup-page.component";
import { VaultPopupAutofillService } from "./../../../services/vault-popup-autofill.service";

/**
 * The types of actions that can be triggered when loading the view vault item popout via the
 * extension ContextMenu. See context-menu-clicked-handler.ts for more information.
 */
type LoadAction =
  | typeof AUTOFILL_ID
  | typeof SHOW_AUTOFILL_BUTTON
  | typeof COPY_USERNAME_ID
  | typeof COPY_PASSWORD_ID
  | typeof COPY_VERIFICATION_CODE_ID;

@Component({
  selector: "app-view-v2",
  templateUrl: "view-v2.component.html",
  standalone: true,
  imports: [
    CommonModule,
    SearchModule,
    JslibModule,
    FormsModule,
    ButtonModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopupFooterComponent,
    IconButtonModule,
    CipherViewComponent,
    AsyncActionsModule,
    PopOutComponent,
  ],
  providers: [
    { provide: ViewPasswordHistoryService, useClass: BrowserViewPasswordHistoryService },
    { provide: PremiumUpgradePromptService, useClass: BrowserPremiumUpgradePromptService },
  ],
})
export class ViewV2Component {
  headerText: string;
  cipher: CipherView;
  organization$: Observable<Organization>;
  canDeleteCipher$: Observable<boolean>;
  collections$: Observable<CollectionView[]>;
  loadAction: LoadAction;
  senderTabId?: number;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private i18nService: I18nService,
    private cipherService: CipherService,
    private dialogService: DialogService,
    private logService: LogService,
    private toastService: ToastService,
    private vaultPopupAutofillService: VaultPopupAutofillService,
    private accountService: AccountService,
    private eventCollectionService: EventCollectionService,
    private popupRouterCacheService: PopupRouterCacheService,
    protected cipherAuthorizationService: CipherAuthorizationService,
    private copyCipherFieldService: CopyCipherFieldService,
  ) {
    this.subscribeToParams();
  }

  subscribeToParams(): void {
    this.route.queryParams
      .pipe(
        switchMap(async (params): Promise<CipherView> => {
          this.loadAction = params.action;
          this.senderTabId = params.senderTabId ? parseInt(params.senderTabId, 10) : undefined;
          return await this.getCipherData(params.cipherId);
        }),
        switchMap(async (cipher) => {
          this.cipher = cipher;
          this.headerText = this.setHeader(cipher.type);

          if (this.loadAction) {
            await this._handleLoadAction(this.loadAction, this.senderTabId);
          }

          this.canDeleteCipher$ = this.cipherAuthorizationService.canDeleteCipher$(cipher);

          await this.eventCollectionService.collect(
            EventType.Cipher_ClientViewed,
            cipher.id,
            false,
            cipher.organizationId,
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  setHeader(type: CipherType) {
    switch (type) {
      case CipherType.Login:
        return this.i18nService.t("viewItemHeader", this.i18nService.t("typeLogin"));
      case CipherType.Card:
        return this.i18nService.t("viewItemHeader", this.i18nService.t("typeCard"));
      case CipherType.Identity:
        return this.i18nService.t("viewItemHeader", this.i18nService.t("typeIdentity"));
      case CipherType.SecureNote:
        return this.i18nService.t("viewItemHeader", this.i18nService.t("note"));
      case CipherType.SshKey:
        return this.i18nService.t("viewItemHeader", this.i18nService.t("typeSshkey"));
    }
  }

  async getCipherData(id: string) {
    const cipher = await this.cipherService.get(id);
    const activeUserId = await firstValueFrom(
      this.accountService.activeAccount$.pipe(map((a) => a?.id)),
    );
    return await cipher.decrypt(
      await this.cipherService.getKeyForCipherKeyDecryption(cipher, activeUserId),
    );
  }

  async editCipher() {
    if (this.cipher.isDeleted) {
      return false;
    }
    void this.router.navigate(["/edit-cipher"], {
      queryParams: { cipherId: this.cipher.id, type: this.cipher.type, isNew: false },
    });
    return true;
  }

  delete = async (): Promise<boolean> => {
    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "deleteItem" },
      content: {
        key: this.cipher.isDeleted ? "permanentlyDeleteItemConfirmation" : "deleteItemConfirmation",
      },
      type: "warning",
    });

    if (!confirmed) {
      return false;
    }

    try {
      await this.deleteCipher();
    } catch (e) {
      this.logService.error(e);
      return false;
    }

    await this.popupRouterCacheService.back();

    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t(this.cipher.isDeleted ? "permanentlyDeletedItem" : "deletedItem"),
    });

    return true;
  };

  restore = async (): Promise<void> => {
    try {
      await this.cipherService.restoreWithServer(this.cipher.id);
    } catch (e) {
      this.logService.error(e);
    }

    await this.popupRouterCacheService.back();
    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("restoredItem"),
    });
  };

  protected deleteCipher() {
    return this.cipher.isDeleted
      ? this.cipherService.deleteWithServer(this.cipher.id)
      : this.cipherService.softDeleteWithServer(this.cipher.id);
  }

  protected showFooter(): boolean {
    return this.cipher && (!this.cipher.isDeleted || (this.cipher.isDeleted && this.cipher.edit));
  }

  /**
   * Handles the load action for the view vault item popout. These actions are typically triggered
   * via the extension context menu. It is necessary to render the view for items that have password
   * reprompt enabled.
   * @param loadAction
   * @param senderTabId
   * @private
   */
  private async _handleLoadAction(loadAction: LoadAction, senderTabId?: number): Promise<void> {
    let actionSuccess = false;

    // Both vaultPopupAutofillService and copyCipherFieldService will perform password re-prompting internally.

    switch (loadAction) {
      case "show-autofill-button":
        // This action simply shows the cipher view, no need to do anything.
        return;
      case "autofill":
        actionSuccess = await this.vaultPopupAutofillService.doAutofill(this.cipher, false);
        break;
      case "copy-username":
        actionSuccess = await this.copyCipherFieldService.copy(
          this.cipher.login.username,
          "username",
          this.cipher,
        );
        break;
      case "copy-password":
        actionSuccess = await this.copyCipherFieldService.copy(
          this.cipher.login.password,
          "password",
          this.cipher,
        );
        break;
      case "copy-totp":
        actionSuccess = await this.copyCipherFieldService.copy(
          this.cipher.login.totp,
          "totp",
          this.cipher,
        );
        break;
    }

    if (BrowserPopupUtils.inPopout(window)) {
      setTimeout(
        async () => {
          if (
            BrowserPopupUtils.inSingleActionPopout(window, VaultPopoutType.viewVaultItem) &&
            senderTabId
          ) {
            await BrowserApi.focusTab(senderTabId);
            await closeViewVaultItemPopout(`${VaultPopoutType.viewVaultItem}_${this.cipher.id}`);
          } else {
            await this.popupRouterCacheService.back();
          }
        },
        actionSuccess ? 1000 : 0,
      );
    }
  }
}
