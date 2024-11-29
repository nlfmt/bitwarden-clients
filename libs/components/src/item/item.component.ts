import { CommonModule } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  HostListener,
  signal,
} from "@angular/core";

import { A11yRowDirective } from "../a11y/a11y-row.directive";

import { ItemActionComponent } from "./item-action.component";

@Component({
  selector: "bit-item",
  standalone: true,
  imports: [CommonModule, ItemActionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "item.component.html",
  providers: [{ provide: A11yRowDirective, useExisting: ItemComponent }],
  host: {
    class:
      "tw-block tw-box-border tw-overflow-auto tw-flex tw-bg-background [&:has(.item-main-content_button:hover,.item-main-content_a:hover)]:tw-cursor-pointer [&:has(.item-main-content_button:hover,.item-main-content_a:hover)]:tw-bg-primary-100 tw-text-main tw-border-solid tw-border-b tw-border-0 [&:not(bit-layout_*)]:tw-rounded-lg bit-compact:[&:not(bit-layout_*)]:tw-rounded-none bit-compact:[&:not(bit-layout_*)]:last-of-type:tw-rounded-b-lg bit-compact:[&:not(bit-layout_*)]:first-of-type:tw-rounded-t-lg tw-min-h-9 tw-mb-1.5 bit-compact:tw-mb-0",
  },
})
export class ItemComponent extends A11yRowDirective {
  /**
   * We have `:focus-within` and `:focus-visible` but no `:focus-visible-within`
   */
  protected focusVisibleWithin = signal(false);
  @HostListener("focusin", ["$event.target"])
  onFocusIn(target: HTMLElement) {
    this.focusVisibleWithin.set(target.matches(".fvw-target:focus-visible"));
  }
  @HostListener("focusout")
  onFocusOut() {
    this.focusVisibleWithin.set(false);
  }

  @HostBinding("class") get classList(): string[] {
    return [
      this.focusVisibleWithin()
        ? "tw-z-10 tw-rounded tw-outline-none tw-ring-2 bit-compact:tw-ring-inset tw-ring-primary-600 tw-border-transparent".split(
            " ",
          )
        : "tw-border-b-shadow",
    ].flat();
  }
}
