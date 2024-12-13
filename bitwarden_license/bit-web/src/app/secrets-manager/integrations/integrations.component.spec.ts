import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { mock } from "jest-mock-extended";
import { of } from "rxjs";

import { SharedModule } from "@bitwarden/components/src/shared";
import {
  IntegrationCardComponent,
  IntegrationGridComponent,
} from "@bitwarden/web-vault/app/shared";

import { SYSTEM_THEME_OBSERVABLE } from "../../../../../../libs/angular/src/services/injection-tokens";
import { I18nService } from "../../../../../../libs/common/src/platform/abstractions/i18n.service";
import { ThemeType } from "../../../../../../libs/common/src/platform/enums";
import { ThemeStateService } from "../../../../../../libs/common/src/platform/theming/theme-state.service";

import { IntegrationsComponent } from "./integrations.component";

@Component({
  selector: "app-header",
  template: "<div></div>",
})
class MockHeaderComponent {}

@Component({
  selector: "sm-new-menu",
  template: "<div></div>",
})
class MockNewMenuComponent {}

describe("IntegrationsComponent", () => {
  let fixture: ComponentFixture<IntegrationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [IntegrationsComponent, MockHeaderComponent, MockNewMenuComponent],
      imports: [IntegrationGridComponent, IntegrationCardComponent, SharedModule],
      providers: [
        {
          provide: I18nService,
          useValue: mock<I18nService>(),
        },
        {
          provide: ThemeStateService,
          useValue: mock<ThemeStateService>(),
        },
        {
          provide: SYSTEM_THEME_OBSERVABLE,
          useValue: of(ThemeType.Light),
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(IntegrationsComponent);
    fixture.detectChanges();
  });

  it("divides Integrations & SDKS", () => {
    const [integrationList, sdkList] = fixture.debugElement.queryAll(
      By.directive(IntegrationGridComponent),
    );

    // Validate only expected names, as the data is constant
    expect(
      (integrationList.componentInstance as IntegrationGridComponent).integrations.map(
        (i) => i.name,
      ),
    ).toEqual(["GitHub Actions", "GitLab CI/CD", "Ansible", "Kubernetes Operator"]);

    expect(
      (sdkList.componentInstance as IntegrationGridComponent).integrations.map((i) => i.name),
    ).toEqual(["Rust", "C#", "C++", "Go", "Java", "JS WebAssembly", "php", "Python", "Ruby"]);
  });
});
