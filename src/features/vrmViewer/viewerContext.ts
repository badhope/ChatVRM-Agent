import { createContext } from "react";
import { Viewer } from "./viewer";

// Defer construction until we're in a browser environment. The Viewer
// constructor creates THREE.Scene/lights/clock (pure JS, SSR-safe to
// import) but the broader pipeline (Model → AudioContext, canvas setup)
// requires DOM APIs. Constructing during SSR would either crash or leak
// a singleton that the client can never reach.
const viewer =
  typeof window !== "undefined"
    ? new Viewer()
    : (undefined as unknown as Viewer);

export const ViewerContext = createContext({ viewer });
