// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Injectable } from "@angular/core";
import { ActivatedRoute, NavigationEnd, NavigationStart, ParamMap, Router } from "@angular/router";
import { combineLatest, concatMap, filter, map, Observable, ReplaySubject, startWith } from "rxjs";

import { I18nPipe } from "@bitwarden/angular/platform/pipes/i18n.pipe";
import {
  canAccessOrgAdmin,
  OrganizationService,
} from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { ProviderService } from "@bitwarden/common/admin-console/abstractions/provider.service";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { SyncService } from "@bitwarden/common/platform/sync";

export type ProductSwitcherItem = {
  /**
   * Displayed name
   */
  name: string;

  /**
   * Displayed icon
   */
  icon: string;

  /**
   * Route for items in the `bentoProducts$` section
   */
  appRoute?: string | any[];

  /**
   * Route for items in the `otherProducts$` section
   */
  marketingRoute?: {
    route: string | any[];
    external: boolean;
  };
  /**
   * Route definition for external/internal routes for items in the `otherProducts$` section
   */

  /**
   * Used to apply css styles to show when a button is selected
   */
  isActive?: boolean;

  /**
   * A product switcher item can be shown in the left navigation menu.
   * When shown under the "other" section the content can be overridden.
   */
  otherProductOverrides?: {
    /** Alternative navigation menu name */
    name?: string;
    /** Supporting text that is shown when the product is rendered in the "other" section */
    supportingText?: string;
  };
};

@Injectable({
  providedIn: "root",
})
export class ProductSwitcherService {
  /**
   * Emits when the sync service has completed a sync
   *
   * Without waiting for a sync to be complete, in accurate product information
   * can be displayed to the user for a brief moment until the sync is complete
   * and all data is available.
   */
  private syncCompleted$ = new ReplaySubject<void>(1);

  /**
   * Certain events should trigger an update to the `products$` observable but the values
   * themselves are not needed. This observable is used to only trigger the update.
   */
  private triggerProductUpdate$: Observable<void> = combineLatest([
    this.syncCompleted$,
    this.router.events.pipe(
      // Product paths need to be updated when routes change, but the router event isn't actually needed
      startWith(null), // Start with a null event to trigger the initial combineLatest
      filter((e) => e instanceof NavigationEnd || e instanceof NavigationStart || e === null),
    ),
  ]).pipe(map(() => null));

  constructor(
    private organizationService: OrganizationService,
    private providerService: ProviderService,
    private route: ActivatedRoute,
    private router: Router,
    private i18n: I18nPipe,
    private syncService: SyncService,
  ) {
    this.pollUntilSynced();
  }

  products$: Observable<{
    bento: ProductSwitcherItem[];
    other: ProductSwitcherItem[];
  }> = combineLatest([
    this.organizationService.organizations$,
    this.route.paramMap,
    this.triggerProductUpdate$,
  ]).pipe(
    map(([orgs, ...rest]): [Organization[], ParamMap, void] => {
      return [
        // Sort orgs by name to match the order within the sidebar
        orgs.sort((a, b) => a.name.localeCompare(b.name)),
        ...rest,
      ];
    }),
    concatMap(async ([orgs, paramMap]) => {
      let routeOrg = orgs.find((o) => o.id === paramMap.get("organizationId"));

      let organizationIdViaPath: string | null = null;

      if (["/sm/", "/organizations/"].some((path) => this.router.url.includes(path))) {
        // Grab the organization ID from the URL
        organizationIdViaPath = this.router.url.split("/")[2] ?? null;
      }

      // When the user is already viewing an organization within an application use it as the active route org
      if (organizationIdViaPath && !routeOrg) {
        routeOrg = orgs.find((o) => o.id === organizationIdViaPath);
      }

      // If the active route org doesn't have access to SM, find the first org that does.
      const smOrg =
        routeOrg?.canAccessSecretsManager && routeOrg?.enabled == true
          ? routeOrg
          : orgs.find((o) => o.canAccessSecretsManager && o.enabled == true);

      // If the active route org doesn't have access to AC, find the first org that does.
      const acOrg =
        routeOrg != null && canAccessOrgAdmin(routeOrg)
          ? routeOrg
          : orgs.find((o) => canAccessOrgAdmin(o));

      // TODO: This should be migrated to an Observable provided by the provider service and moved to the combineLatest above. See AC-2092.
      const providers = await this.providerService.getAll();

      const products = {
        pm: {
          name: "Password Manager",
          icon: "bwi-lock",
          appRoute: "/vault",
          marketingRoute: {
            route: "https://bitwarden.com/products/personal/",
            external: true,
          },
          isActive:
            !this.router.url.includes("/sm/") &&
            !this.router.url.includes("/organizations/") &&
            !this.router.url.includes("/providers/"),
        },
        sm: {
          name: "Secrets Manager",
          icon: "bwi-cli",
          appRoute: ["/sm", smOrg?.id],
          marketingRoute: {
            route: "/sm-landing",
            external: false,
          },
          isActive: this.router.url.includes("/sm/"),
          otherProductOverrides: {
            supportingText: this.i18n.transform("secureYourInfrastructure"),
          },
        },
        ac: {
          name: "Admin Console",
          icon: "bwi-business",
          appRoute: ["/organizations", acOrg?.id],
          marketingRoute: {
            route: "https://bitwarden.com/products/business/",
            external: true,
          },
          isActive: this.router.url.includes("/organizations/"),
        },
        provider: {
          name: "Provider Portal",
          icon: "bwi-provider",
          appRoute: ["/providers", providers[0]?.id],
          isActive: this.router.url.includes("/providers/"),
        },
        orgs: {
          name: "Organizations",
          icon: "bwi-business",
          marketingRoute: {
            route: "https://bitwarden.com/products/business/",
            external: true,
          },
          otherProductOverrides: {
            name: "Share your passwords",
            supportingText: this.i18n.transform("protectYourFamilyOrBusiness"),
          },
        },
      } satisfies Record<string, ProductSwitcherItem>;

      const bento: ProductSwitcherItem[] = [products.pm];
      const other: ProductSwitcherItem[] = [];

      if (smOrg) {
        bento.push(products.sm);
      } else {
        other.push(products.sm);
      }

      if (acOrg) {
        bento.push(products.ac);
      } else {
        other.push(products.orgs);
      }

      if (providers.length > 0) {
        bento.push(products.provider);
      }

      return {
        bento,
        other,
      };
    }),
  );

  /** Poll the `syncService` until a sync is completed */
  private pollUntilSynced() {
    const interval = setInterval(async () => {
      const lastSync = await this.syncService.getLastSync();
      if (lastSync !== null) {
        clearInterval(interval);
        this.syncCompleted$.next();
      }
    }, 200);
  }
}
