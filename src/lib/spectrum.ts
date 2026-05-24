const SPECTRUM_BASE = process.env.SPECTRUM_BASE ?? "https://spectrum.photon.codes";

export interface SharedUserResponse {
  succeed: boolean;
  data?: {
    id: string;
    projectId: string;
    type: "shared" | "dedicated";
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phoneNumber: string;
    assignedPhoneNumber: string;
    meta: unknown;
    createdAt: string;
  };
  message?: string;
  error?: string;
}

/** Create or fetch a Spectrum shared user, returning the assigned iMessage line. */
export async function createSharedUser(input: {
  phoneNumber: string;
  firstName?: string | null;
}): Promise<SharedUserResponse["data"]> {
  const projectId = process.env.PROJECT_ID;
  const projectSecret = process.env.PROJECT_SECRET;
  if (!projectId || !projectSecret) {
    throw new Error("PROJECT_ID and PROJECT_SECRET must be set on the server.");
  }
  const auth = Buffer.from(`${projectId}:${projectSecret}`).toString("base64");
  const url = `${SPECTRUM_BASE}/projects/${encodeURIComponent(projectId)}/users/`;

  const body: Record<string, unknown> = {
    type: "shared",
    phoneNumber: input.phoneNumber,
  };
  if (input.firstName) body.firstName = input.firstName.slice(0, 40);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });

  let json: SharedUserResponse | null = null;
  try {
    json = (await res.json()) as SharedUserResponse;
  } catch {
    /* leave json null */
  }

  if (!res.ok || !json?.succeed || !json.data?.assignedPhoneNumber) {
    const detail = json?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`Spectrum create-user failed: ${detail}`);
  }
  return json.data;
}
