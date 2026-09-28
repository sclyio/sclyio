import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p>
        <Link href="/">Home</Link>
      </p>
    </>
  );
}
