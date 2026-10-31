using System.Net.Mail;
using System.Text.RegularExpressions;
using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

public class Member : TenantEntity, IAuditedEntity
{
    private static readonly Regex PhonePattern = new(@"^[0-9+()\-\s.]{7,30}$", RegexOptions.Compiled);

    public string FullName { get; private set; } = string.Empty;
    public string? Phone { get; private set; }
    public string? Email { get; private set; }
    public DateOnly JoinDate { get; private set; }

    private Member() { }

    public Member(Guid churchId, string fullName, string? phone, string? email, DateOnly joinDate, DateOnly today)
        : base(churchId) => Apply(fullName, phone, email, joinDate, today);

    public void Update(string fullName, string? phone, string? email, DateOnly joinDate, DateOnly today) =>
        Apply(fullName, phone, email, joinDate, today);

    private void Apply(string fullName, string? phone, string? email, DateOnly joinDate, DateOnly today)
    {
        var name = RequirePlainText(fullName, nameof(FullName), 200);
        var cleanPhone = OptionalPlainText(phone, nameof(Phone), 30);
        if (cleanPhone is not null && !PhonePattern.IsMatch(cleanPhone))
            throw new DomainException("Phone has an invalid format.");
        var cleanEmail = OptionalPlainText(email, nameof(Email), 256);
        if (cleanEmail is not null && !IsValidEmail(cleanEmail))
            throw new DomainException("Email has an invalid format.");
        if (joinDate > today || joinDate.Year < 1900)
            throw new DomainException("JoinDate is out of range.");

        FullName = name;
        Phone = cleanPhone;
        Email = cleanEmail;
        JoinDate = joinDate;
        Touch();
    }

    private static bool IsValidEmail(string value) =>
        MailAddress.TryCreate(value, out var addr) && addr.Address == value && value.Contains('@') && !value.Contains(' ');
}
