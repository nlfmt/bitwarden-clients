import { CommonModule } from "@angular/common";
import { Meta, moduleMetadata, StoryObj } from "@storybook/angular";

import { BadgeDirective } from "./badge.directive";

export default {
  title: "Component Library/Badge",
  component: BadgeDirective,
  decorators: [
    moduleMetadata({
      imports: [CommonModule],
      declarations: [BadgeDirective],
    }),
  ],
  args: {
    variant: "primary",
    truncate: false,
  },
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/file/Zt3YSeb6E6lebAffrNLa0h/Tailwind-Component-Library?node-id=1881%3A16956",
    },
  },
} as Meta<BadgeDirective>;

type Story = StoryObj<BadgeDirective>;

export const Variants: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <span class="tw-text-main tw-mx-1">Default</span>
      <button class="tw-mx-1" bitBadge variant="primary" [truncate]="truncate">Primary</button>
      <button class="tw-mx-1" bitBadge variant="secondary" [truncate]="truncate">Secondary</button>
      <button class="tw-mx-1" bitBadge variant="success" [truncate]="truncate">Success</button>
      <button class="tw-mx-1" bitBadge variant="danger" [truncate]="truncate">Danger</button>
      <button class="tw-mx-1" bitBadge variant="warning" [truncate]="truncate">Warning</button>
      <button class="tw-mx-1" bitBadge variant="info" [truncate]="truncate">Info</button>
      <br/><br/>
      <span class="tw-text-main tw-mx-1">Hover</span>
      <button class="tw-mx-1 tw-test-hover" bitBadge variant="primary" [truncate]="truncate">Primary</button>
      <button class="tw-mx-1 tw-test-hover" bitBadge variant="secondary" [truncate]="truncate">Secondary</button>
      <button class="tw-mx-1 tw-test-hover" bitBadge variant="success" [truncate]="truncate">Success</button>
      <button class="tw-mx-1 tw-test-hover" bitBadge variant="danger" [truncate]="truncate">Danger</button>
      <button class="tw-mx-1 tw-test-hover" bitBadge variant="warning" [truncate]="truncate">Warning</button>
      <button class="tw-mx-1 tw-test-hover" bitBadge variant="info" [truncate]="truncate">Info</button>
      <br/><br/>
      <span class="tw-text-main tw-mx-1">Focus Visible</span>
      <button class="tw-mx-1 tw-test-focus-visible" bitBadge variant="primary" [truncate]="truncate">Primary</button>
      <button class="tw-mx-1 tw-test-focus-visible" bitBadge variant="secondary" [truncate]="truncate">Secondary</button>
      <button class="tw-mx-1 tw-test-focus-visible" bitBadge variant="success" [truncate]="truncate">Success</button>
      <button class="tw-mx-1 tw-test-focus-visible" bitBadge variant="danger" [truncate]="truncate">Danger</button>
      <button class="tw-mx-1 tw-test-focus-visible" bitBadge variant="warning" [truncate]="truncate">Warning</button>
      <button class="tw-mx-1 tw-test-focus-visible" bitBadge variant="info" [truncate]="truncate">Info</button>
      <br/><br/>
      <span class="tw-text-main tw-mx-1">Disabled</span>
      <button disabled class="tw-mx-1" bitBadge variant="primary" [truncate]="truncate">Primary</button>
      <button disabled class="tw-mx-1" bitBadge variant="secondary" [truncate]="truncate">Secondary</button>
      <button disabled class="tw-mx-1" bitBadge variant="success" [truncate]="truncate">Success</button>
      <button disabled class="tw-mx-1" bitBadge variant="danger" [truncate]="truncate">Danger</button>
      <button disabled class="tw-mx-1" bitBadge variant="warning" [truncate]="truncate">Warning</button>
      <button disabled class="tw-mx-1" bitBadge variant="info" [truncate]="truncate">Info</button>
    `,
  }),
};

export const Primary: Story = {
  render: (args) => ({
    props: args,
    template: /*html*/ `
      <span class="tw-text-main">Span </span><span bitBadge [variant]="variant" [truncate]="truncate">Badge containing lengthy text</span>
      <br /><br />
      <span class="tw-text-main">Link </span><a href="#" bitBadge [variant]="variant" [truncate]="truncate">Badge</a>
      <br /><br />
      <span class="tw-text-main">Button </span><button bitBadge [variant]="variant" [truncate]="truncate">Badge</button>
    `,
  }),
};

export const Secondary: Story = {
  ...Primary,
  args: {
    variant: "secondary",
  },
};

export const Success: Story = {
  ...Primary,
  args: {
    variant: "success",
  },
};

export const Danger: Story = {
  ...Primary,
  args: {
    variant: "danger",
  },
};

export const Warning: Story = {
  ...Primary,
  args: {
    variant: "warning",
  },
};

export const Info: Story = {
  ...Primary,
  args: {
    variant: "info",
  },
};

export const Truncated: Story = {
  ...Primary,
  args: {
    truncate: true,
  },
};
