using ChurchSeeker.Domain.Common;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Domain.Exceptions;

namespace ChurchSeeker.Domain.Entities;

// Financial record. Immutable once created: a mistake is fixed by voiding (IsActive = false) and re-entering.
// MemberId is null for anonymous donations and nothing else ever links the donation to a person.
public class Donation : TenantEntity, IAuditedEntity
{
    public const decimal MaxAmount = 100_000_000m;

    public DateOnly Date { get; private set; }
    // Stored as whole cents so SUM works in SQL on every provider and no floating-point error exists.
    public long AmountCents { get; private set; }
    public string Concept { get; private set; } = string.Empty;
    public DonationMethod Method { get; private set; }
    public Guid? MemberId { get; private set; }

    public decimal Amount => AmountCents / 100m;
    public bool IsAnonymous => MemberId is null;

    private Donation() { }

    public Donation(Guid churchId, DateOnly date, decimal amount, string concept, DonationMethod method,
                    Guid? memberId, DateOnly today) : base(churchId)
    {
        if (amount <= 0) throw new DomainException("Amount must be greater than zero.");
        if (amount > MaxAmount) throw new DomainException("Amount is too large.");
        if (decimal.Round(amount, 2) != amount) throw new DomainException("Amount cannot have more than 2 decimals.");
        if (date > today || date.Year < 2000) throw new DomainException("Date is out of range.");
        if (!Enum.IsDefined(method)) throw new DomainException("Method is invalid.");
        if (memberId == Guid.Empty) throw new DomainException("MemberId is invalid.");

        Concept = RequirePlainText(concept, nameof(Concept), 200);
        Date = date;
        AmountCents = decimal.ToInt64(amount * 100m);
        Method = method;
        MemberId = memberId;
    }
}
