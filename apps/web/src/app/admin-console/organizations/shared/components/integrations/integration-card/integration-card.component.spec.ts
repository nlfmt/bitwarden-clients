import { ComponentFixture, TestBed } from "@angular/core/testing";
import { mock } from "jest-mock-extended";
import { BehaviorSubject } from "rxjs";

import { SYSTEM_THEME_OBSERVABLE } from "@bitwarden/angular/services/injection-tokens";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { ThemeType } from "@bitwarden/common/platform/enums";
import { ThemeStateService } from "@bitwarden/common/platform/theming/theme-state.service";
import { SharedModule } from "@bitwarden/components/src/shared";
import { I18nPipe } from "@bitwarden/components/src/shared/i18n.pipe";

import { IntegrationCardComponent } from "./integration-card.component";

describe("IntegrationCardComponent", () => {
  let component: IntegrationCardComponent;
  let fixture: ComponentFixture<IntegrationCardComponent>;

  const systemTheme$ = new BehaviorSubject<ThemeType>(ThemeType.Light);
  const usersPreferenceTheme$ = new BehaviorSubject<ThemeType>(ThemeType.Light);

  beforeEach(async () => {
    // reset system theme
    systemTheme$.next(ThemeType.Light);

    await TestBed.configureTestingModule({
      imports: [IntegrationCardComponent, SharedModule],
      providers: [
        {
          provide: ThemeStateService,
          useValue: { selectedTheme$: usersPreferenceTheme$ },
        },
        {
          provide: SYSTEM_THEME_OBSERVABLE,
          useValue: systemTheme$,
        },
        {
          provide: I18nPipe,
          useValue: mock<I18nPipe>(),
        },
        {
          provide: I18nService,
          useValue: mock<I18nService>(),
        },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(IntegrationCardComponent);
    component = fixture.componentInstance;

    component.name = "Integration Name";
    component.image = "test-image.png";
    component.linkURL = "https://example.com/";

    fixture.detectChanges();
  });

  it("assigns link href", () => {
    const link = fixture.nativeElement.querySelector("a");

    expect(link.href).toBe("https://example.com/");
  });

  it("renders card body", () => {
    const name = fixture.nativeElement.querySelector("h3");

    expect(name.textContent).toBe("Integration Name");
  });

  it("assigns external rel attribute", () => {
    component.externalURL = true;
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector("a");

    expect(link.rel).toBe("noopener noreferrer");
  });

  describe("new badge", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2023-09-01"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("shows when expiration is in the future", () => {
      component.newBadgeExpiration = "2023-09-02";
      expect(component.showNewBadge()).toBe(true);
    });

    it("does not show when expiration is not set", () => {
      expect(component.showNewBadge()).toBe(false);
    });

    it("does not show when expiration is in the past", () => {
      component.newBadgeExpiration = "2023-08-31";
      expect(component.showNewBadge()).toBe(false);
    });

    it("does not show when expiration is today", () => {
      component.newBadgeExpiration = "2023-09-01";
      expect(component.showNewBadge()).toBe(false);
    });

    it("does not show when expiration is invalid", () => {
      component.newBadgeExpiration = "not-a-date";
      expect(component.showNewBadge()).toBe(false);
    });
  });

  describe("imageDarkMode", () => {
    it("ignores theme changes when darkModeImage is not set", () => {
      systemTheme$.next(ThemeType.Dark);
      usersPreferenceTheme$.next(ThemeType.Dark);

      fixture.detectChanges();

      expect(component.imageEle.nativeElement.src).toContain("test-image.png");
    });

    describe("user prefers the system theme", () => {
      beforeEach(() => {
        component.imageDarkMode = "test-image-dark.png";
      });

      it("sets image src to imageDarkMode", () => {
        usersPreferenceTheme$.next(ThemeType.System);
        systemTheme$.next(ThemeType.Dark);

        fixture.detectChanges();

        expect(component.imageEle.nativeElement.src).toContain("test-image-dark.png");
      });

      it("sets image src to light mode image", () => {
        component.imageEle.nativeElement.src = "test-image-dark.png";

        usersPreferenceTheme$.next(ThemeType.System);
        systemTheme$.next(ThemeType.Light);

        fixture.detectChanges();

        expect(component.imageEle.nativeElement.src).toContain("test-image.png");
      });
    });

    describe("user prefers dark mode", () => {
      beforeEach(() => {
        component.imageDarkMode = "test-image-dark.png";
      });

      it("updates image to dark mode", () => {
        systemTheme$.next(ThemeType.Light); // system theme shouldn't matter
        usersPreferenceTheme$.next(ThemeType.Dark);

        fixture.detectChanges();

        expect(component.imageEle.nativeElement.src).toContain("test-image-dark.png");
      });
    });

    describe("user prefers light mode", () => {
      beforeEach(() => {
        component.imageDarkMode = "test-image-dark.png";
      });

      it("updates image to light mode", () => {
        component.imageEle.nativeElement.src = "test-image-dark.png";

        systemTheme$.next(ThemeType.Dark); // system theme shouldn't matter
        usersPreferenceTheme$.next(ThemeType.Light);

        fixture.detectChanges();

        expect(component.imageEle.nativeElement.src).toContain("test-image.png");
      });
    });
  });
});
