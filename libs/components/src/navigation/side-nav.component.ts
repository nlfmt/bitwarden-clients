// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Component, ElementRef, Input, ViewChild } from "@angular/core";

import { SideNavService } from "./side-nav.service";

export type SideNavVariant = "primary" | "secondary";

@Component({
  selector: "bit-side-nav",
  templateUrl: "side-nav.component.html",
})
export class SideNavComponent {
  @Input() variant: SideNavVariant = "primary";

  @ViewChild("toggleButton", { read: ElementRef, static: true })
  private toggleButton: ElementRef<HTMLButtonElement>;

  constructor(protected sideNavService: SideNavService) {}

  protected handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.sideNavService.setClose();
      this.toggleButton?.nativeElement.focus();
      return false;
    }

    return true;
  };
}
