import { CommonModule } from "@angular/common";
import { ComponentFixture, fakeAsync, TestBed, tick } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { By } from "@angular/platform-browser";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject } from "rxjs";

import { CollectionView } from "@bitwarden/admin-console/common";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { SelectComponent } from "@bitwarden/components";

import { CipherFormConfig } from "../../abstractions/cipher-form-config.service";
import { CipherFormContainer } from "../../cipher-form-container";

import { ItemDetailsSectionComponent } from "./item-details-section.component";

const createMockCollection = (
  id: string,
  name: string,
  organizationId: string,
  readOnly = false,
  canEdit = true,
) => {
  return {
    id,
    name,
    organizationId,
    externalId: "",
    readOnly,
    hidePasswords: false,
    manage: true,
    assigned: true,
    canEditItems: jest.fn().mockReturnValue(canEdit),
    canEdit: jest.fn(),
    canDelete: jest.fn(),
    canViewCollectionInfo: jest.fn(),
  };
};

describe("ItemDetailsSectionComponent", () => {
  let component: ItemDetailsSectionComponent;
  let fixture: ComponentFixture<ItemDetailsSectionComponent>;
  let cipherFormProvider: MockProxy<CipherFormContainer>;
  let i18nService: MockProxy<I18nService>;

  const activeAccount$ = new BehaviorSubject<{ email: string }>({ email: "test@example.com" });
  const getInitialCipherView = jest.fn(() => null);
  const initializedWithCachedCipher = jest.fn(() => false);

  beforeEach(async () => {
    getInitialCipherView.mockClear();
    initializedWithCachedCipher.mockClear();

    cipherFormProvider = mock<CipherFormContainer>({
      getInitialCipherView,
      initializedWithCachedCipher,
    });
    i18nService = mock<I18nService>();

    await TestBed.configureTestingModule({
      imports: [ItemDetailsSectionComponent, CommonModule, ReactiveFormsModule],
      providers: [
        { provide: CipherFormContainer, useValue: cipherFormProvider },
        { provide: I18nService, useValue: i18nService },
        { provide: AccountService, useValue: { activeAccount$ } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ItemDetailsSectionComponent);
    component = fixture.componentInstance;
    component.config = {
      collections: [],
      organizations: [],
      folders: [],
    } as CipherFormConfig;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  describe("ngOnInit", () => {
    it("should throw an error if no organizations are available for ownership and personal ownership is not allowed", async () => {
      component.config.allowPersonalOwnership = false;
      component.config.organizations = [];
      await expect(component.ngOnInit()).rejects.toThrow(
        "No organizations available for ownership.",
      );
    });

    it("should initialize form with default values if no originalCipher is provided", fakeAsync(async () => {
      component.config.allowPersonalOwnership = true;
      component.config.organizations = [{ id: "org1" } as Organization];
      await component.ngOnInit();
      tick();

      expect(cipherFormProvider.patchCipher).toHaveBeenCalled();
      const patchFn = cipherFormProvider.patchCipher.mock.lastCall[0];

      const updatedCipher = patchFn(new CipherView());

      expect(updatedCipher.name).toBe("");
      expect(updatedCipher.organizationId).toBeNull();
      expect(updatedCipher.folderId).toBeNull();
      expect(updatedCipher.collectionIds).toEqual([]);
      expect(updatedCipher.favorite).toBe(false);
    }));

    it("should initialize form with values from originalCipher if provided", fakeAsync(async () => {
      component.config.allowPersonalOwnership = true;
      component.config.organizations = [{ id: "org1" } as Organization];
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1") as CollectionView,
      ];

      getInitialCipherView.mockReturnValueOnce({
        name: "cipher1",
        organizationId: "org1",
        folderId: "folder1",
        collectionIds: ["col1"],
        favorite: true,
      });

      await component.ngOnInit();
      tick();

      expect(cipherFormProvider.patchCipher).toHaveBeenCalled();
      const patchFn = cipherFormProvider.patchCipher.mock.lastCall[0];

      const updatedCipher = patchFn(new CipherView());

      expect(updatedCipher.name).toBe("cipher1");
      expect(updatedCipher.organizationId).toBe("org1");
      expect(updatedCipher.folderId).toBe("folder1");
      expect(updatedCipher.collectionIds).toEqual(["col1"]);
      expect(updatedCipher.favorite).toBe(true);
    }));

    it("should disable organizationId control if ownership change is not allowed", async () => {
      component.config.allowPersonalOwnership = false;
      component.config.organizations = [{ id: "org1" } as Organization];
      jest.spyOn(component, "allowOwnershipChange", "get").mockReturnValue(false);

      await component.ngOnInit();

      expect(component.itemDetailsForm.controls.organizationId.disabled).toBe(true);
    });
  });

  describe("toggleFavorite", () => {
    it("should toggle the favorite control value", () => {
      component.itemDetailsForm.controls.favorite.setValue(false);
      component.toggleFavorite();
      expect(component.itemDetailsForm.controls.favorite.value).toBe(true);
      component.toggleFavorite();
      expect(component.itemDetailsForm.controls.favorite.value).toBe(false);
    });
  });

  describe("favoriteIcon", () => {
    it("should return the correct icon based on favorite value", () => {
      component.itemDetailsForm.controls.favorite.setValue(false);
      expect(component.favoriteIcon).toBe("bwi-star");
      component.itemDetailsForm.controls.favorite.setValue(true);
      expect(component.favoriteIcon).toBe("bwi-star-f");
    });
  });

  describe("allowOwnershipChange", () => {
    it("should not allow ownership change if in edit mode and the cipher is owned by an organization", () => {
      component.config.mode = "edit";
      component.originalCipherView = {
        organizationId: "org1",
      } as CipherView;
      expect(component.allowOwnershipChange).toBe(false);
    });

    it("should allow ownership change if personal ownership is allowed and there is at least one organization", () => {
      component.config.allowPersonalOwnership = true;
      component.config.organizations = [{ id: "org1" } as Organization];
      expect(component.allowOwnershipChange).toBe(true);
    });

    it("should allow ownership change if personal ownership is not allowed but there is more than one organization", () => {
      component.config.allowPersonalOwnership = false;
      component.config.organizations = [
        { id: "org1" } as Organization,
        { id: "org2" } as Organization,
      ];
      expect(component.allowOwnershipChange).toBe(true);
    });
  });

  describe("defaultOwner", () => {
    it("should return null if personal ownership is allowed", () => {
      component.config.allowPersonalOwnership = true;
      expect(component.defaultOwner).toBeNull();
    });

    it("should return the first organization id if personal ownership is not allowed", () => {
      component.config.allowPersonalOwnership = false;
      component.config.organizations = [{ id: "org1" } as Organization];
      expect(component.defaultOwner).toBe("org1");
    });
  });

  describe("showPersonalOwnerOption", () => {
    it("should show personal ownership when the configuration allows", () => {
      component.config.mode = "edit";
      component.config.allowPersonalOwnership = true;
      component.originalCipherView = {} as CipherView;
      component.config.organizations = [{ id: "134-433-22" } as Organization];
      fixture.detectChanges();

      const select = fixture.debugElement.query(By.directive(SelectComponent));
      const { value, label } = select.componentInstance.items[0];

      expect(value).toBeNull();
      expect(label).toBe("test@example.com");
    });

    it("should show personal ownership when the control is disabled", async () => {
      component.config.mode = "edit";
      component.config.allowPersonalOwnership = false;
      component.originalCipherView = {} as CipherView;
      component.config.organizations = [{ id: "134-433-22" } as Organization];
      await component.ngOnInit();
      fixture.detectChanges();

      const select = fixture.debugElement.query(By.directive(SelectComponent));

      const { value, label } = select.componentInstance.items[0];
      expect(value).toBeNull();
      expect(label).toBe("test@example.com");
    });
  });

  describe("showOwnership", () => {
    it("should return true if ownership change is allowed or in edit mode with at least one organization", () => {
      jest.spyOn(component, "allowOwnershipChange", "get").mockReturnValue(true);
      expect(component.showOwnership).toBe(true);

      jest.spyOn(component, "allowOwnershipChange", "get").mockReturnValue(false);
      component.config.mode = "edit";
      component.config.organizations = [{ id: "org1" } as Organization];
      expect(component.showOwnership).toBe(true);
    });

    it("should hide the ownership control if showOwnership is false", async () => {
      jest.spyOn(component, "showOwnership", "get").mockReturnValue(false);
      fixture.detectChanges();
      await fixture.whenStable();
      const ownershipControl = fixture.nativeElement.querySelector(
        "bit-select[formcontrolname='organizationId']",
      );
      expect(ownershipControl).toBeNull();
    });

    it("should show the ownership control if showOwnership is true", async () => {
      jest.spyOn(component, "allowOwnershipChange", "get").mockReturnValue(true);
      fixture.detectChanges();
      await fixture.whenStable();
      const ownershipControl = fixture.nativeElement.querySelector(
        "bit-select[formcontrolname='organizationId']",
      );
      expect(ownershipControl).not.toBeNull();
    });
  });

  describe("cloneMode", () => {
    beforeEach(() => {
      component.config.mode = "clone";
    });

    it("should append '- Clone' to the title if in clone mode", async () => {
      component.config.allowPersonalOwnership = true;
      const cipher = {
        name: "cipher1",
        organizationId: null,
        folderId: null,
        collectionIds: null,
        favorite: false,
      } as CipherView;

      getInitialCipherView.mockReturnValueOnce(cipher);

      i18nService.t.calledWith("clone").mockReturnValue("Clone");

      await component.ngOnInit();

      expect(component.itemDetailsForm.controls.name.value).toBe("cipher1 - Clone");
    });

    it("does not append clone when the cipher was populated from the cache", async () => {
      component.config.allowPersonalOwnership = true;
      const cipher = {
        name: "from cache cipher",
        organizationId: null,
        folderId: null,
        collectionIds: null,
        favorite: false,
      } as CipherView;

      getInitialCipherView.mockReturnValueOnce(cipher);

      initializedWithCachedCipher.mockReturnValueOnce(true);

      i18nService.t.calledWith("clone").mockReturnValue("Clone");

      await component.ngOnInit();

      expect(component.itemDetailsForm.controls.name.value).toBe("from cache cipher");
    });

    it("should select the first organization if personal ownership is not allowed", async () => {
      component.config.allowPersonalOwnership = false;
      component.config.organizations = [
        { id: "org1" } as Organization,
        { id: "org2" } as Organization,
      ];
      component.originalCipherView = {
        name: "cipher1",
        organizationId: null,
        folderId: null,
        collectionIds: [],
        favorite: false,
      } as CipherView;

      await component.ngOnInit();

      expect(component.itemDetailsForm.controls.organizationId.value).toBe("org1");
    });
  });

  describe("collectionOptions", () => {
    it("should reset and disable/hide collections control when no organization is selected", async () => {
      component.config.allowPersonalOwnership = true;
      component.itemDetailsForm.controls.organizationId.setValue(null);

      fixture.detectChanges();
      await fixture.whenStable();

      const collectionSelect = fixture.nativeElement.querySelector(
        "bit-multi-select[formcontrolname='collectionIds']",
      );

      expect(component.itemDetailsForm.controls.collectionIds.value).toEqual(null);
      expect(component.itemDetailsForm.controls.collectionIds.disabled).toBe(true);
      expect(collectionSelect).toBeNull();
    });

    it("should enable/show collection control when an organization is selected", async () => {
      component.config.allowPersonalOwnership = true;
      component.config.organizations = [{ id: "org1" } as Organization];
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1") as CollectionView,
        createMockCollection("col2", "Collection 2", "org1") as CollectionView,
      ];

      fixture.detectChanges();
      await fixture.whenStable();

      component.itemDetailsForm.controls.organizationId.setValue("org1");

      fixture.detectChanges();
      await fixture.whenStable();

      const collectionSelect = fixture.nativeElement.querySelector(
        "bit-multi-select[formcontrolname='collectionIds']",
      );

      expect(component.itemDetailsForm.controls.collectionIds.enabled).toBe(true);
      expect(collectionSelect).not.toBeNull();
    });

    it("should set collectionIds to originalCipher collections on first load", async () => {
      component.config.mode = "clone";
      getInitialCipherView.mockReturnValueOnce({
        name: "cipher1",
        organizationId: "org1",
        folderId: "folder1",
        collectionIds: ["col1", "col2"],
        favorite: true,
      });
      component.config.organizations = [{ id: "org1" } as Organization];
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1") as CollectionView,
        createMockCollection("col2", "Collection 2", "org1") as CollectionView,
        createMockCollection("col3", "Collection 3", "org1") as CollectionView,
      ];

      fixture.detectChanges();
      await fixture.whenStable();

      expect(cipherFormProvider.patchCipher).toHaveBeenCalled();
      const patchFn = cipherFormProvider.patchCipher.mock.lastCall[0];

      const updatedCipher = patchFn(new CipherView());

      expect(updatedCipher.collectionIds).toEqual(["col1", "col2"]);
    });

    it("should automatically select the first collection if only one is available", async () => {
      component.config.allowPersonalOwnership = true;
      component.config.organizations = [{ id: "org1" } as Organization];
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1") as CollectionView,
      ];

      fixture.detectChanges();
      await fixture.whenStable();

      component.itemDetailsForm.controls.organizationId.setValue("org1");

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.itemDetailsForm.controls.collectionIds.value).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "col1" })]),
      );
    });

    it("should show readonly hint if readonly collections are present", async () => {
      component.config.mode = "edit";
      getInitialCipherView.mockReturnValueOnce({
        name: "cipher1",
        organizationId: "org1",
        folderId: "folder1",
        collectionIds: ["col1", "col2", "col3"],
        favorite: true,
      });
      component.originalCipherView = {
        name: "cipher1",
        organizationId: "org1",
        folderId: "folder1",
        collectionIds: ["col1", "col2", "col3"],
        favorite: true,
      } as CipherView;
      component.config.organizations = [{ id: "org1" } as Organization];
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1", true, false) as CollectionView,
        createMockCollection("col2", "Collection 2", "org1", true, false) as CollectionView,
        createMockCollection("col3", "Collection 3", "org1", true) as CollectionView,
      ];

      await component.ngOnInit();
      fixture.detectChanges();

      const collectionHint = fixture.nativeElement.querySelector(
        "bit-hint[data-testid='view-only-hint']",
      );

      expect(collectionHint).not.toBeNull();
    });

    it("should allow all collections to be altered when `config.admin` is true", async () => {
      component.config.admin = true;
      component.config.allowPersonalOwnership = true;
      component.config.organizations = [{ id: "org1" } as Organization];
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1", true, false) as CollectionView,
        createMockCollection("col2", "Collection 2", "org1", true, false) as CollectionView,
        createMockCollection("col3", "Collection 3", "org1", false, false) as CollectionView,
      ];

      fixture.detectChanges();
      await fixture.whenStable();

      component.itemDetailsForm.controls.organizationId.setValue("org1");

      expect(component["collectionOptions"].map((c) => c.id)).toEqual(["col1", "col2", "col3"]);
    });
  });

  describe("readonlyCollections", () => {
    beforeEach(() => {
      component.config.mode = "edit";
      component.config.admin = true;
      component.config.collections = [
        createMockCollection("col1", "Collection 1", "org1", true, false) as CollectionView,
        createMockCollection("col2", "Collection 2", "org1", false, true) as CollectionView,
        createMockCollection("col3", "Collection 3", "org1", true, false) as CollectionView,
      ];
      component.originalCipherView = {
        name: "cipher1",
        organizationId: "org1",
        folderId: "folder1",
        collectionIds: ["col1", "col2", "col3"],
        favorite: true,
      } as CipherView;

      getInitialCipherView.mockReturnValue(component.originalCipherView);

      component.config.organizations = [{ id: "org1" } as Organization];
    });

    it("should not show collections as readonly when `config.admin` is true", async () => {
      component.config.isAdminConsole = true;
      await component.ngOnInit();
      fixture.detectChanges();

      // Filters out all collections
      expect(component["readOnlyCollections"]).toEqual([]);

      // Non-admin, keep readonly collections
      component.config.admin = false;

      await component.ngOnInit();
      fixture.detectChanges();
      expect(component["readOnlyCollectionsNames"]).toEqual(["Collection 1", "Collection 3"]);
    });
  });
});
