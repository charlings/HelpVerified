"use client";

import { useQuery } from "@tanstack/react-query";
import { agenciesApi, agencyKeys } from "./api";

export function useAgencyDashboard(enabled = true) {
  return useQuery({ queryKey: agencyKeys.dashboard, queryFn: agenciesApi.dashboard, enabled });
}
