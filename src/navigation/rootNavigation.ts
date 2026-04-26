/**
 * Root stack (Results, Upgrade, …) sits above the tab navigator.
 * Tab screens must dispatch through this stack for those routes.
 */
export function getRootStackNavigation(navigation: { getParent?: () => any }): any {
  const tabNav = navigation.getParent?.();
  const stackNav = tabNav?.getParent?.();
  return stackNav ?? tabNav ?? navigation;
}

export function navigateFromTabs(navigation: { getParent?: () => any }, name: string, params?: object) {
  getRootStackNavigation(navigation).navigate(name as never, params as never);
}
