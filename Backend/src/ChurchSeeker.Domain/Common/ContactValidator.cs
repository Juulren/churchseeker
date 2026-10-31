using System.Net.Mail;
using System.Text.RegularExpressions;

namespace ChurchSeeker.Domain.Common;

public static partial class ContactValidator
{
    [GeneratedRegex(@"^[0-9+()\-\s.]{7,30}$")]
    private static partial Regex PhonePattern();

    public static bool IsValidPhone(string value) => PhonePattern().IsMatch(value);

    public static bool IsValidEmail(string value) =>
        MailAddress.TryCreate(value, out var addr) && addr.Address == value && value.Contains('@') && !value.Contains(' ');
}
