import { z } from "zod";
export const proposalSchema = z.object({
  title: z.string().max(80),
  description: z.string().max(5000),
  category: z.string().max(200),
  brand: z.string().max(100),
  partNumber: z.string().max(100),
  fitment: z.string().max(500),
  verification: z.array(z.string().max(300)).min(1).max(15),
});
export type Proposal = z.infer<typeof proposalSchema>;
export type Draft = Proposal & {
  id: string;
  format: "fixed" | "auction";
  bestOffer: boolean;
  price: string;
  duration: number;
  length: string;
  width: string;
  height: string;
  weight: string;
  confirmed: boolean;
  photos: string[];
  updatedAt: string;
};
export const demoProposal: Proposal = {
  title: "Used motorsports part — identification required",
  description:
    "DEMO TEMPLATE: Describe the photographed part, visible markings, condition, wear, and any included hardware. This template does not identify your photos. Verify all details before use.",
  category: "Motorsports parts — verify category",
  brand: "Unknown",
  partNumber: "Unknown",
  fitment: "Unknown — seller must verify compatibility",
  verification: [
    "Identify the part and manufacturer",
    "Read and verify the part number",
    "Confirm fitment and category",
    "Inspect condition, defects, and included hardware",
  ],
};
export function newDraft(): Draft {
  return {
    ...demoProposal,
    id: crypto.randomUUID(),
    title: "",
    description: "",
    format: "fixed",
    bestOffer: false,
    price: "",
    duration: 7,
    length: "",
    width: "",
    height: "",
    weight: "",
    confirmed: false,
    photos: [],
    updatedAt: new Date().toISOString(),
  };
}
export function ready(d: Draft) {
  return (
    !!d.title.trim() &&
    !!d.description.trim() &&
    Number(d.price) > 0 &&
    [d.length, d.width, d.height, d.weight].every(
      (v) => Number.isFinite(Number(v)) && Number(v) > 0,
    ) &&
    d.confirmed
  );
}
