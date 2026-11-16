export function validatePersonal(d, { password = false, phone = false } = {}) {
  if (
    password &&
    (d.password.length < 10 ||
      d.password.length > 128 ||
      !/[A-Za-z]/.test(d.password) ||
      !/[0-9]/.test(d.password))
  )
    throw new Error("Use 10–128 characters, including a letter and a number.");
  if (phone && d.phone) {
    let value = d.phone.trim();
    if (!/^[+0-9 ()-]+$/.test(value))
      throw new Error("Enter a valid phone number.");
    value = value.replace(/[ ()-]/g, "");
    if (value.startsWith("09")) value = "+95" + value.slice(1);
    if (
      !/^\+959\d{7,9}$/.test(value) &&
      !(/^\+[1-9]\d{7,14}$/.test(value) && !value.startsWith("+95"))
    )
      throw new Error(
        "Use a Myanmar mobile number (09…) or an international number with country code.",
      );
  }
}
