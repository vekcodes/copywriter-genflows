"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientProject } from "@/lib/types";
import { makeProject } from "@/lib/project";

const KEY = "genflows.copywriter.projects.v1";
const ACTIVE_KEY = "genflows.copywriter.active.v1";

type Updater = Partial<ClientProject> | ((p: ClientProject) => ClientProject);

export function useProjects() {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setProjects(JSON.parse(raw) as ClientProject[]);
      const a = localStorage.getItem(ACTIVE_KEY);
      if (a) setActiveId(a);
    } catch {
      /* ignore corrupt storage */
    }
    setLoaded(true);
  }, []);

  // Persist (debounced) whenever projects change.
  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(projects));
      } catch {
        /* quota / disabled storage */
      }
    }, 250);
    return () => clearTimeout(id);
  }, [projects, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* ignore */
    }
  }, [activeId, loaded]);

  const create = useCallback(
    (input: {
      name: string;
      website: string;
      valueProp?: string;
      offers?: string;
      onboardingDocs: string;
      strategyIdea: string;
    }) => {
      const p = makeProject(input);
      setProjects((prev) => [p, ...prev]);
      setActiveId(p.id);
      return p;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const update = useCallback((id: string, updater: Updater) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const next =
          typeof updater === "function" ? updater(p) : { ...p, ...updater };
        return { ...next, updatedAt: Date.now() };
      }),
    );
  }, []);

  const active = projects.find((p) => p.id === activeId) ?? null;

  return {
    projects,
    active,
    activeId,
    setActiveId,
    create,
    remove,
    update,
    loaded,
  };
}
