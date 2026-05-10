"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import DailyClient from "./DailyClient";

export default function DailyPageClient() {
  useSearchParams();
  return <DailyClient />;
}