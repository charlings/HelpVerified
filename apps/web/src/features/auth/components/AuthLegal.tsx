import Link from "next/link";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";

export function AuthLegal() {
  const { prefix, terms, and, privacy } = authCopy.legal;
  return (
    <p>
      {prefix}{" "}
      <Link href={routes.terms} className="font-semibold text-blue-600 hover:underline">
        {terms}
      </Link>{" "}
      {and}{" "}
      <Link href={routes.privacy} className="font-semibold text-blue-600 hover:underline">
        {privacy}
      </Link>
      .
    </p>
  );
}
