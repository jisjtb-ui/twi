export const X_SELECTORS = {
  POST_TEXTBOX: '[data-testid="tweetTextarea_0"][contenteditable="true"]',
  POST_BUTTON: '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]',
  PROFILE_LINK: '[data-testid="AppTabBar_Profile_Link"]',
  ACCOUNT_MENU: '[data-testid="SideNav_AccountSwitcher_Button"]',
} as const;

export const X_URLS = {
  HOME: "https://x.com/home",
  COMPOSE: "https://x.com/compose/post",
} as const;
