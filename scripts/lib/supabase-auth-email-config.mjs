import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = resolve(__dirname, "..", "..", "supabase", "email-templates");

function readTemplate(file) {
  return readFileSync(resolve(templateDir, file), "utf8");
}

export function buildSupabaseAuthEmailConfig() {
  return {
    mailer_subjects_confirmation: "Confirm your Odd Wheels email",
    mailer_templates_confirmation_content: readTemplate("confirmation.html"),
    mailer_subjects_recovery: "Reset your Odd Wheels password",
    mailer_templates_recovery_content: readTemplate("recovery.html"),
    mailer_subjects_magic_link: "Your Odd Wheels sign-in link",
    mailer_templates_magic_link_content: readTemplate("magic-link.html"),
    mailer_subjects_invite: "You're invited to Odd Wheels",
    mailer_templates_invite_content: readTemplate("invite.html"),
    mailer_subjects_email_change: "Confirm your new Odd Wheels email",
    mailer_templates_email_change_content: readTemplate("email-change.html"),
    mailer_subjects_reauthentication: "Your Odd Wheels verification code",
    mailer_templates_reauthentication_content: readTemplate("reauthentication.html"),
  };
}
