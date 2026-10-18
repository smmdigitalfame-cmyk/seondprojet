import { getPersistentJson, setPersistentJson } from "@/lib/persistentStorage";

const GRAPH_VISIBILITY_KEY = "reel_graph_visibility_v1";

const getKey = (account: string, postIndex: number) => `${account}:${postIndex}`;

export const getReelGraphVisibility = (account: string, postIndex: number) => {
  const prefs = getPersistentJson<Record<string, boolean>>(GRAPH_VISIBILITY_KEY, {});
  return prefs[getKey(account, postIndex)] ?? true;
};

export const setReelGraphVisibility = (account: string, postIndex: number, visible: boolean) => {
  const prefs = getPersistentJson<Record<string, boolean>>(GRAPH_VISIBILITY_KEY, {});
  setPersistentJson(GRAPH_VISIBILITY_KEY, {
    ...prefs,
    [getKey(account, postIndex)]: visible,
  });
};