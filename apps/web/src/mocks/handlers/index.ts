import { adminHandlers } from "./admin";
import { agencyHandlers } from "./agencies";
import { agencyDashboardHandlers } from "./agency-dashboard";
import { authHandlers } from "./auth";
import { billingHandlers } from "./billing";
import { contactHandlers } from "./contact";
import { documentHandlers } from "./documents";
import { familyPlacementHandlers } from "./family-placements";
import { familyRequestHandlers } from "./family-requests";
import { paymentHandlers } from "./payments";
import { placementHandlers } from "./placements";
import { requestHandlers } from "./requests";
import { uploadHandlers } from "./uploads";
import { verificationHandlers } from "./verification";
import { workerHandlers } from "./workers";

export const handlers = [
  ...authHandlers,
  ...adminHandlers,
  // /agencies/me before /agencies so the specific route wins.
  ...billingHandlers,
  ...agencyHandlers,
  ...agencyDashboardHandlers,
  // Family handlers answer family callers on paths shared with agencies and fall through otherwise.
  ...familyRequestHandlers,
  ...requestHandlers,
  ...paymentHandlers,
  ...familyPlacementHandlers,
  ...placementHandlers,
  ...workerHandlers,
  ...verificationHandlers,
  ...uploadHandlers,
  ...documentHandlers,
  ...contactHandlers,
];
