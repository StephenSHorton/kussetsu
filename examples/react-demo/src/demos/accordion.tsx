import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../ui/accordion";

export const meta = {
  title: "Accordion",
  description: "Single-open disclosure — Radix handles keyboard, focus, and ARIA.",
  minH: "min-h-[220px]",
};

const items = [
  {
    value: "glass",
    q: "Is every surface glass?",
    a: "Yes — each panel refracts the grass behind its card in real time.",
  },
  {
    value: "a11y",
    q: "Is it accessible?",
    a: "Radix owns keyboard navigation, focus management, and ARIA roles.",
  },
  {
    value: "single",
    q: "Can multiple stay open?",
    a: "Not here — type=\"single\" with collapsible keeps one open at a time.",
  },
];

export default function Demo() {
  return (
    <Accordion type="single" collapsible defaultValue="glass" className="w-96 max-w-full">
      {items.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
