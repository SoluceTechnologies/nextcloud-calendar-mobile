import type { Account } from "@/types";

function basicAuth(account: Pick<Account, "username" | "appPassword">): string {
  return "Basic " + btoa(`${account.username}:${account.appPassword}`);
}

export async function fetchUserInfo(
  account: Pick<Account, "baseUrl" | "username" | "appPassword" | "davUserId">,
): Promise<{ timezone: string; email: string }> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/users/${encodeURIComponent(account.davUserId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: basicAuth(account),
        "OCS-APIRequest": "true",
        Accept: "application/json",
      },
    });
    if (!res.ok) return { timezone: "", email: "" };
    const json = await res.json();
    const data = json?.ocs?.data;
    return {
      timezone: (data?.timezone as string) || "",
      email: (data?.email as string) || "",
    };
  } catch {
    return { timezone: "", email: "" };
  }
}

export type ThemingCapabilities = {
  color: string;
  colorText: string | null;
  userEditable: boolean;
  logo: string | null;
};

export async function fetchThemingCapabilities(
  account: Pick<Account, "baseUrl" | "username" | "appPassword">,
): Promise<ThemingCapabilities> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/capabilities`;
    const res = await fetch(url, {
      headers: {
        Authorization: basicAuth(account),
        "OCS-APIRequest": "true",
        Accept: "application/json",
      },
    });

    if (!res.ok)
      return {
        color: "#0082c9",
        colorText: "#ffffff",
        userEditable: false,
        logo: null,
      };
    const json = await res.json();
    const theming = json?.ocs?.data?.capabilities?.theming;
    return {
      color: (theming?.color as string) || "#0082c9",
      colorText: (theming?.["color-text"] as string) || "#ffffff",
      userEditable: Boolean(theming?.user_editable),
      logo: (theming?.logo as string) || null,
    };
  } catch {
    return {
      color: "#0082c9",
      colorText: "#ffffff",
      userEditable: false,
      logo: null,
    };
  }
}

export async function updateUserPrimaryColor(
  account: Pick<Account, "baseUrl" | "username" | "appPassword" | "davUserId">,
  colorHex: string,
): Promise<boolean> {
  try {
    const url = `${account.baseUrl}/ocs/v2.php/cloud/users/${encodeURIComponent(account.davUserId)}/setting/theming/color`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: basicAuth(account),
        "OCS-APIRequest": "true",
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ value: colorHex }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
