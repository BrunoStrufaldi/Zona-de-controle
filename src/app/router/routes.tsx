import { type RouteObject } from "react-router";

import { AppLayout } from "@/app/layouts/app-layout";

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [{ index: true, element: <h1 className="text-2xl font-semibold">Dashboard</h1> }],
  },
];
