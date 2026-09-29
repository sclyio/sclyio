import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Csrf, Flash } from "@/components/account";
import { seasonLabel } from "@/components/plain";
import { SubmitButton } from "@/components/submit-button";
import { schoolById, schoolSeasons, searchSchools } from "@/lib/accounts/dataset";
import { dataSource, pageUser } from "@/lib/accounts/server";
import { joinSchoolAction, saveDisplayNameAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your account", robots: { index: false } };

export default async function Onboarding(props: PageProps<"/onboarding">) {
  const sp = (await props.searchParams) as Record<string, string | undefined>;
  const { actor, csrf } = await pageUser("/onboarding", { allowNotOnboarded: true });
  const adding = sp.add === "1";
  if (actor.onboarded && !adding) redirect("/dashboard");
  const keep = adding ? "&add=1" : "";
  const step = !actor.displayName ? 1 : sp.school ? 3 : 2;
  const steps = ["Display name", "School", "Division and season"];

  return (
    <>
      <h1>{adding ? "Add a school affiliation" : "Set up your account"}</h1>
      <ol className="steps" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className={i + 1 === step ? "on" : i + 1 < step ? "done" : undefined} aria-current={i + 1 === step ? "step" : undefined}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <Flash sp={sp} />

      {step === 1 ? (
        <section className="card">
          <h2>Choose a display name</h2>
          <p className="muted">Shown on your public member profile and your school&apos;s Members tab (you can make your profile private in Settings). Your Google email is never shown.</p>
          <form action={saveDisplayNameAction}>
            <Csrf token={csrf} />
            <input type="hidden" name="back" value={`/onboarding?x=1${keep}`} />
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" required minLength={2} maxLength={40} autoComplete="nickname" />
              <span className="hint">2 to 40 characters.</span>
            </div>
            <SubmitButton>Continue</SubmitButton>
          </form>
        </section>
      ) : step === 2 ? (
        <SchoolSearch q={sp.q ?? ""} keep={keep} />
      ) : (
        <SchoolSeason schoolId={sp.school!} csrf={csrf} keep={keep} />
      )}
      <p className="note">
        Choosing a school does not verify you or give you any access to the school&apos;s records. Your affiliation starts as self-reported; you
        can ask the scly.io admin to verify it later.
      </p>
    </>
  );
}

async function SchoolSearch({ q, keep }: { q: string; keep: string }) {
  const results = q.trim().length >= 2 ? await searchSchools(dataSource, q) : [];
  return (
    <section className="card flush">
      <div style={{ padding: 16 }}>
        <h2>Find your school</h2>
        <form className="inline-form" action="/onboarding" role="search">
          {keep ? <input type="hidden" name="add" value="1" /> : null}
          <div className="field">
            <label htmlFor="q">School name</label>
            <input id="q" name="q" defaultValue={q} required minLength={2} placeholder="e.g. Troy High School" />
          </div>
          <button type="submit">Search</button>
        </form>
      </div>
      {q.trim().length >= 2 ? (
        results.length ? (
          <ul className="choice-list" aria-label="Schools">
            {results.map((s) => (
              <li key={s.id}>
                <Link href={`/onboarding?school=${encodeURIComponent(s.id)}${keep}`}>
                  <span>
                    <b>{s.name}</b>
                    <div className="sub">{[s.city, s.state].filter(Boolean).join(", ")}</div>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ padding: "0 16px 16px" }}>
            No imported school matches “{q}”. Only schools with published Duosmium results can be chosen.
          </p>
        )
      ) : null}
    </section>
  );
}

async function SchoolSeason({ schoolId, csrf, keep }: { schoolId: string; csrf: string; keep: string }) {
  const school = await schoolById(dataSource, schoolId);
  if (!school) {
    return (
      <p className="flash error" role="alert">
        That school was not found. <Link href={`/onboarding?x=1${keep}`}>Search again</Link>
      </p>
    );
  }
  const seasons = await schoolSeasons(dataSource, school.id);
  return (
    <section className="card">
      <h2>
        {school.name} <span className="muted">· {[school.city, school.state].filter(Boolean).join(", ")}</span>
      </h2>
      <form action={joinSchoolAction}>
        <Csrf token={csrf} />
        <input type="hidden" name="school" value={school.id} />
        <input type="hidden" name="back" value={`/onboarding?school=${encodeURIComponent(school.id)}${keep}`} />
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="label">Which division and season were you on this school&apos;s team?</legend>
          <ul className="choice-list card" style={{ padding: 0, marginTop: 6 }}>
            {seasons.map((s, i) => (
              <li key={`${s.division}:${s.season}`}>
                <label>
                  <input type="radio" name="ds" value={`${s.division}:${s.season}`} required defaultChecked={i === 0} />
                  <span>
                    Division {s.division} · {seasonLabel(s.season)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <span className="hint">Add each season separately. You can be at different schools in different seasons, but only one school per season.</span>
        </fieldset>
        <SubmitButton>Save affiliation</SubmitButton> <Link href={`/onboarding?x=1${keep}`}>Choose a different school</Link>
      </form>
    </section>
  );
}
