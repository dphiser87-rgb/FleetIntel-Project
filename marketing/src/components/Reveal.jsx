import { useReveal } from "../hooks/useReveal";

export default function Reveal({ children, className = "", as: Tag = "div", delayMs = 0 }) {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      className={`${className} transition-[opacity,translate] duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
      }`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : "0ms" }}
    >
      {children}
    </Tag>
  );
}
