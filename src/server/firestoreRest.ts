import fs from 'node:fs';
import path from 'node:path';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

export const PROJECT_ID = firebaseConfig.projectId;
export const DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
export const API_KEY = firebaseConfig.apiKey;

export interface VerifiedTokenUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedTokenUser | null> {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{
        localId: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
      }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: user.localId,
      email: (user.email || '').toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName,
    };
  } catch {
    return null;
  }
}

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export function toFsValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((item) => toFsValue(item)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        fields[k] = toFsValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function fromFsValue(val: FirestoreValue | undefined): unknown {
  if (!val) return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((v) => fromFsValue(v));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      out[k] = fromFsValue(v);
    }
    return out;
  }
  return undefined;
}

export function toFsFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = toFsValue(v);
    }
  }
  return fields;
}

export function fromFsDocument<T = Record<string, unknown>>(doc: {
  name?: string;
  fields?: Record<string, FirestoreValue>;
}): T | null {
  if (!doc || !doc.fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = fromFsValue(v);
  }
  return out as T;
}

export function docResourceName(docPath: string): string {
  const clean = docPath.replace(/^\/+/, '');
  return `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${clean}`;
}

export async function fsGetDoc<T = Record<string, unknown>>(
  docPath: string,
  idToken: string,
): Promise<{ exists: boolean; status: number; data: T | null; error?: string }> {
  const url = `https://firestore.googleapis.com/v1/${docResourceName(docPath)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) {
    return { exists: false, status: 404, data: null };
  }
  if (!res.ok) {
    const errText = await res.text();
    return { exists: false, status: res.status, data: null, error: errText };
  }
  const json = (await res.json()) as { name?: string; fields?: Record<string, FirestoreValue> };
  return { exists: true, status: 200, data: fromFsDocument<T>(json) };
}

export interface CommitWrite {
  docPath: string;
  data?: Record<string, unknown>;
  updateMask?: string[];
  existsPrecondition?: boolean;
  serverTimestampFields?: string[];
  deleteDoc?: boolean;
}

export async function fsCommitWrites(
  writes: CommitWrite[],
  idToken: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:commit`;
  const formattedWrites = writes.map((w) => {
    const name = docResourceName(w.docPath);
    if (w.deleteDoc) {
      return { delete: name };
    }
    const writeObj: Record<string, unknown> = {
      update: {
        name,
        fields: toFsFields(w.data || {}),
      },
    };
    if (w.updateMask && w.updateMask.length > 0) {
      writeObj.updateMask = { fieldPaths: w.updateMask };
    }
    if (w.existsPrecondition !== undefined) {
      writeObj.currentDocument = { exists: w.existsPrecondition };
    }
    if (w.serverTimestampFields && w.serverTimestampFields.length > 0) {
      writeObj.updateTransforms = w.serverTimestampFields.map((fieldPath) => ({
        fieldPath,
        setToServerValue: 'REQUEST_TIME',
      }));
    }
    return writeObj;
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: formattedWrites }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, error: errText };
  }
  return { ok: true, status: 200 };
}
