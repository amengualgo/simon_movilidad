import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../theme/ThemeProvider.js";
import { ThemeToggle } from "../theme/ThemeToggle.js";

/**
 * Cubre DW-05: alternar tema debe reflejarse tanto en la clase "dark" del
 * documento (de la que depende TODA la paleta vía variables CSS) como en
 * localStorage, para persistir la preferencia entre sesiones.
 */
describe("ThemeToggle (DW-05)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("modo oscuro es el default cuando no hay preferencia guardada (positivo)", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button")).toHaveTextContent(/oscuro/i);
  });

  it("alternar el toggle cambia a modo claro y actualiza el documento (positivo)", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("fleet-theme-mode")).toBe("light");
  });

  it("respeta una preferencia previamente guardada en localStorage (positivo)", () => {
    localStorage.setItem("fleet-theme-mode", "light");
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
