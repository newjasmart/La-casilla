import { expect, Locator, test } from "@playwright/test";
import { deleteRow, queryTable } from "./db";

/**
 * Playwright's `.fill()` on `<input type="date">` is unreliable here: it can
 * silently leave the field empty when a sibling date input's `min`/`max`
 * changes between fills (observed against this component — the React state
 * itself is fine, confirmed by manual testing). Set the value through
 * React's native input setter instead, exactly like a real keystroke would.
 */
async function fillDate(locator: Locator, value: string): Promise<void> {
  await locator.evaluate((el: HTMLInputElement, v: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/**
 * A field filled the instant the page loads can land before React finishes
 * hydrating the (server-rendered) form — hydration then reconciles the
 * input back to its pristine empty state, silently dropping the value. Wait
 * for the check-availability button to actually be interactive first.
 */
async function waitForHydration(page: import("@playwright/test").Page): Promise<void> {
  await page.getByTestId("booking-check-availability").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
}

/**
 * Full booking path, end to end, against a real local Supabase — nothing
 * mocked. Confirms both that the UI shows success AND that the row really
 * exists in Postgres afterwards (the "proof"), then cleans up after itself
 * so re-runs stay repeatable.
 *
 * Dates: inside the "Temporada alta DEV" rate period seeded locally
 * (2027-07-01 .. 2027-09-01, minimum_nights = 5), comfortably clear of the
 * "Festa Major DEV" period (2027-08-14 .. 2027-08-18) — see
 * backend/supabase/seed.sql.
 */
const ARRIVAL = "2027-07-10";
const DEPARTURE = "2027-07-15";
const TEST_EMAIL = `playwright-e2e+${Date.now()}@lacasillacasarural.test`;

interface ReservationRow {
  id: string;
  calendar_entry_id: string;
  public_reference: string;
  email: string;
  status: string;
  arrival_date: string;
  departure_date: string;
  nights: number;
  total_amount: string;
}

test.describe("Booking flow (real DB, no mocks)", () => {
  test.afterEach(async () => {
    // Best-effort cleanup so re-runs don't collide with the exclusion
    // constraint on calendar_entries. Order matters: history -> reservation
    // -> calendar entry (FKs are ON DELETE RESTRICT).
    const rows = await queryTable<ReservationRow>(
      "reservations",
      `email=eq.${encodeURIComponent(TEST_EMAIL)}&select=id,calendar_entry_id`,
    );
    for (const row of rows) {
      await deleteRow("reservation_status_history", `reservation_id=eq.${row.id}`);
      await deleteRow("reservations", `id=eq.${row.id}`);
      await deleteRow("calendar_entries", `id=eq.${row.calendar_entry_id}`);
    }
  });

  test("a guest can check availability, submit a reservation, and it lands in Postgres", async ({ page }) => {
    await page.goto("/#reserva");
    await waitForHydration(page);

    await fillDate(page.getByTestId("booking-arrival"), ARRIVAL);
    await fillDate(page.getByTestId("booking-departure"), DEPARTURE);
    await page.getByTestId("booking-adults").fill("2");

    await page.getByTestId("booking-check-availability").click();

    // The RPC round-trip to the local Supabase instance.
    await expect(page.getByTestId("booking-quote")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("booking-quote-error")).toHaveCount(0);

    await page.getByTestId("booking-first-name").fill("Proves");
    await page.getByTestId("booking-last-name").fill("Playwright");
    await page.getByTestId("booking-email").fill(TEST_EMAIL);
    await page.getByTestId("booking-phone").fill("+34600000000");
    await page.getByTestId("booking-privacy-accept").check();

    await page.getByTestId("booking-submit").click();

    await expect(page.getByTestId("booking-success")).toBeVisible({ timeout: 15_000 });
    const reference = await page.getByTestId("booking-reference").textContent();
    expect(reference).toBeTruthy();

    // --- Proof: read it back directly from Postgres via the REST API ---
    const rows = await queryTable<ReservationRow>(
      "reservations",
      `public_reference=eq.${encodeURIComponent(reference!.trim())}&select=*`,
    );
    expect(rows).toHaveLength(1);
    const saved = rows[0];
    expect(saved.email).toBe(TEST_EMAIL);
    expect(saved.arrival_date).toBe(ARRIVAL);
    expect(saved.departure_date).toBe(DEPARTURE);
    expect(saved.nights).toBe(5);
    expect(saved.status).toBe("requested");
    expect(Number(saved.total_amount)).toBeGreaterThan(0);

    // The GIST exclusion constraint's other half: an active calendar entry
    // now blocks the same dates for anyone else.
    const calendarRows = await queryTable<{ id: string; state: string; kind: string }>(
      "calendar_entries",
      `id=eq.${saved.calendar_entry_id}&select=id,state,kind`,
    );
    expect(calendarRows).toHaveLength(1);
    expect(calendarRows[0].state).toBe("active");
    expect(calendarRows[0].kind).toBe("reservation");
  });

  test("submitting the same dates a second time is rejected as unavailable", async ({ page }) => {
    // First booking occupies the dates.
    await page.goto("/#reserva");
    await waitForHydration(page);
    await fillDate(page.getByTestId("booking-arrival"), ARRIVAL);
    await fillDate(page.getByTestId("booking-departure"), DEPARTURE);
    await page.getByTestId("booking-check-availability").click();
    await expect(page.getByTestId("booking-quote")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("booking-first-name").fill("Proves");
    await page.getByTestId("booking-last-name").fill("Playwright");
    await page.getByTestId("booking-email").fill(TEST_EMAIL);
    await page.getByTestId("booking-privacy-accept").check();
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-success")).toBeVisible({ timeout: 15_000 });

    // Second attempt, same dates, fresh page load: should now read as
    // unavailable since the exclusion constraint has an active entry.
    await page.goto("/#reserva");
    await waitForHydration(page);
    await fillDate(page.getByTestId("booking-arrival"), ARRIVAL);
    await fillDate(page.getByTestId("booking-departure"), DEPARTURE);
    await page.getByTestId("booking-check-availability").click();

    await expect(page.getByTestId("booking-quote-error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("booking-quote")).toHaveCount(0);
  });
});
