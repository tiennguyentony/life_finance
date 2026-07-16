import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  buildEventState,
  buildMidRunState,
  buildRecap,
} from "./fixtures";
import { PreviewGallery } from "./preview-client";

export const metadata: Metadata = { title: "Design preview" };

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <PreviewGallery
      midRun={buildMidRunState()}
      recap={buildRecap()}
      withEvent={buildEventState()}
    />
  );
}
