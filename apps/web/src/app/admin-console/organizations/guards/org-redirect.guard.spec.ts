// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { MockProxy, mock } from "jest-mock-extended";

import { OrganizationService } from "@bitwarden/common/admin-console/abstractions/organization/organization.service.abstraction";
import { OrganizationUserType } from "@bitwarden/common/admin-console/enums";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";

import { organizationRedirectGuard } from "./org-redirect.guard";

@Component({
  template: "<h1>This is the home screen!</h1>",
})
export class HomescreenComponent {}

@Component({
  template: "<h1>This is the admin console!</h1>",
})
export class AdminConsoleComponent {}

@Component({
  template: "<h1> This is a subroute of the admin console!</h1>",
})
export class AdminConsoleSubrouteComponent {}

const orgFactory = (props: Partial<Organization> = {}) =>
  Object.assign(
    new Organization(),
    {
      id: "myOrgId",
      enabled: true,
      type: OrganizationUserType.Admin,
    },
    props,
  );

describe("Organization Redirect Guard", () => {
  let organizationService: MockProxy<OrganizationService>;
  let routerHarness: RouterTestingHarness;

  beforeEach(async () => {
    organizationService = mock<OrganizationService>();

    TestBed.configureTestingModule({
      providers: [
        { provide: OrganizationService, useValue: organizationService },
        provideRouter([
          {
            path: "",
            component: HomescreenComponent,
          },
          {
            path: "organizations/:organizationId",
            component: AdminConsoleComponent,
          },
          {
            path: "organizations/:organizationId/stringCallback/success",
            component: AdminConsoleSubrouteComponent,
          },
          {
            path: "organizations/:organizationId/arrayCallback/exponential/success",
            component: AdminConsoleSubrouteComponent,
          },
          {
            path: "organizations/:organizationId/noCallback",
            component: AdminConsoleComponent,
            canActivate: [organizationRedirectGuard()],
          },
          {
            path: "organizations/:organizationId/stringCallback",
            component: AdminConsoleComponent,
            canActivate: [organizationRedirectGuard(() => "success")],
          },
          {
            path: "organizations/:organizationId/arrayCallback",
            component: AdminConsoleComponent,
            canActivate: [organizationRedirectGuard(() => ["exponential", "success"])],
          },
        ]),
      ],
    });

    routerHarness = await RouterTestingHarness.create();
  });

  it("redirects to `/` if the organization id provided is not found", async () => {
    const org = orgFactory();
    organizationService.get.calledWith(org.id).mockResolvedValue(null);
    await routerHarness.navigateByUrl(`organizations/${org.id}/noCallback`);
    expect(routerHarness.routeNativeElement?.querySelector("h1")?.textContent?.trim() ?? "").toBe(
      "This is the home screen!",
    );
  });

  it("redirects to `/organizations/{id}` if no custom redirect is supplied but the user can access the admin onsole", async () => {
    const org = orgFactory();
    organizationService.get.calledWith(org.id).mockResolvedValue(org);
    await routerHarness.navigateByUrl(`organizations/${org.id}/noCallback`);
    expect(routerHarness.routeNativeElement?.querySelector("h1")?.textContent?.trim() ?? "").toBe(
      "This is the admin console!",
    );
  });

  it("redirects properly when the redirect callback returns a single string", async () => {
    const org = orgFactory();
    organizationService.get.calledWith(org.id).mockResolvedValue(org);
    await routerHarness.navigateByUrl(`organizations/${org.id}/stringCallback`);
    expect(routerHarness.routeNativeElement?.querySelector("h1")?.textContent?.trim() ?? "").toBe(
      "This is a subroute of the admin console!",
    );
  });

  it("redirects properly when the redirect callback returns an array of strings", async () => {
    const org = orgFactory();
    organizationService.get.calledWith(org.id).mockResolvedValue(org);
    await routerHarness.navigateByUrl(`organizations/${org.id}/arrayCallback`);
    expect(routerHarness.routeNativeElement?.querySelector("h1")?.textContent?.trim() ?? "").toBe(
      "This is a subroute of the admin console!",
    );
  });
});
