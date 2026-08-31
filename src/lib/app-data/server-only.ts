export function assertAppDataServerOnly(context = "app-data/client.server"): void {
  if (typeof window !== "undefined") {
    throw new Error(
      `@/lib/${context} is server-only. Call connector tools from a createServerFn handler, never from a React component.`,
    );
  }
}
assertAppDataServerOnly("app-data/client.server");
