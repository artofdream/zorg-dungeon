import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Maker's renderer starts as a plain 2D canvas view (board-game phase).
// A future 3D renderer (three.js / react-three-fiber) mounts behind the same
// RoomView interface (see src/App.tsx) without touching @zorg/engine.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: ["../.."],
    },
  },
});
