using ChurchSeeker.Application.Common;
using ChurchSeeker.Domain.Enums;

namespace ChurchSeeker.Application.Donations;

// Omit MemberId (or send null) for an anonymous donation.
public record DonationRequest(DateOnly Date, decimal Amount, string Concept, DonationMethod Method, Guid? MemberId);

public record DonationResponse(Guid Id, DateOnly Date, decimal Amount, string Concept, DonationMethod Method,
                               Guid? MemberId, bool IsAnonymous, bool IsVoided);

public record DonationQuery(DateOnly? From = null, DateOnly? To = null, DonationMethod? Method = null,
                            bool? Anonymous = null, bool IncludeVoided = false, int Page = 1, int PageSize = 20);

public record DonationPage(IReadOnlyList<DonationResponse> Items, int Page, int PageSize, int Total, decimal TotalAmount);

public record MonthlyIncomeRow(int Month, int Count, decimal Total, int AnonymousCount, decimal AnonymousTotal);

public interface IDonationService
{
    Task<Result<DonationResponse>> CreateAsync(DonationRequest request, CancellationToken ct = default);
    Task<Result<DonationResponse>> GetAsync(Guid id, CancellationToken ct = default);
    Task<Result<DonationPage>> ListAsync(DonationQuery query, CancellationToken ct = default);
    Task<Result<DonationResponse>> VoidAsync(Guid id, CancellationToken ct = default);
    Task<Result<IReadOnlyList<MonthlyIncomeRow>>> MonthlySummaryAsync(int year, CancellationToken ct = default);
    // Used by the dashboard and income reports. Voided donations never count.
    Task<decimal> TotalAsync(DateOnly from, DateOnly to, CancellationToken ct = default);
}
