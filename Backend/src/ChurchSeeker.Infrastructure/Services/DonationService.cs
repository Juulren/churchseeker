using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Donations;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class DonationService : IDonationService
{
    private readonly IRepository<Donation> _donations;
    private readonly IRepository<Member> _members;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;

    public DonationService(IRepository<Donation> donations, IRepository<Member> members, ICurrentUser current, TimeProvider clock)
    {
        _donations = donations; _members = members; _current = current; _clock = clock;
    }

    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    public async Task<Result<DonationResponse>> CreateAsync(DonationRequest r, CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } churchId) return Result<DonationResponse>.Fail(ErrorKind.Forbidden);
        if (r.MemberId is { } mid && !await _members.Query().AsNoTracking().AnyAsync(m => m.Id == mid && m.IsActive, ct))
            return Result<DonationResponse>.Fail(ErrorKind.Validation, "MemberId does not match an active member.");
        try
        {
            var d = new Donation(churchId, r.Date, r.Amount, r.Concept, r.Method, r.MemberId, Today);
            await _donations.AddAsync(d, ct);
            await _donations.SaveChangesAsync(ct);
            return Result<DonationResponse>.Ok(ToResponse(d));
        }
        catch (DomainException ex) { return Result<DonationResponse>.Fail(ErrorKind.Validation, ex.Message); }
    }

    public async Task<Result<DonationResponse>> GetAsync(Guid id, CancellationToken ct = default)
    {
        var d = await _donations.GetByIdAsync(id, ct);
        return d is null ? Result<DonationResponse>.Fail(ErrorKind.NotFound) : Result<DonationResponse>.Ok(ToResponse(d));
    }

    public async Task<Result<DonationPage>> ListAsync(DonationQuery q, CancellationToken ct = default)
    {
        if (q.From is { } f && q.To is { } t && f > t)
            return Result<DonationPage>.Fail(ErrorKind.Validation, "From must not be after To.");
        if (q.Method is { } m && !Enum.IsDefined(m))
            return Result<DonationPage>.Fail(ErrorKind.Validation, "Method is invalid.");

        var page = Math.Max(1, q.Page);
        var size = Math.Clamp(q.PageSize, 1, 100);
        var query = _donations.Query().AsNoTracking();
        if (!q.IncludeVoided) query = query.Where(d => d.IsActive);
        if (q.From is { } from) query = query.Where(d => d.Date >= from);
        if (q.To is { } to) query = query.Where(d => d.Date <= to);
        if (q.Method is { } method) query = query.Where(d => d.Method == method);
        if (q.Anonymous is { } anon) query = anon ? query.Where(d => d.MemberId == null) : query.Where(d => d.MemberId != null);

        var total = await query.CountAsync(ct);
        var cents = await query.Where(d => d.IsActive).SumAsync(d => (long?)d.AmountCents, ct) ?? 0;
        var items = await query.OrderByDescending(d => d.Date).ThenBy(d => d.Id)
            .Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return Result<DonationPage>.Ok(new DonationPage(items.Select(ToResponse).ToList(), page, size, total, cents / 100m));
    }

    public async Task<Result<DonationResponse>> VoidAsync(Guid id, CancellationToken ct = default)
    {
        var d = await _donations.GetByIdAsync(id, ct);
        if (d is null) return Result<DonationResponse>.Fail(ErrorKind.NotFound);
        if (!d.IsActive) return Result<DonationResponse>.Ok(ToResponse(d));
        d.Deactivate();
        await _donations.SaveChangesAsync(ct);
        return Result<DonationResponse>.Ok(ToResponse(d));
    }

    public async Task<Result<IReadOnlyList<MonthlyIncomeRow>>> MonthlySummaryAsync(int year, CancellationToken ct = default)
    {
        if (year is < 2000 or > 2100) return Result<IReadOnlyList<MonthlyIncomeRow>>.Fail(ErrorKind.Validation, "Year is out of range.");
        var start = new DateOnly(year, 1, 1);
        var end = new DateOnly(year, 12, 31);
        var rows = await _donations.Query().AsNoTracking()
            .Where(d => d.IsActive && d.Date >= start && d.Date <= end)
            .Select(d => new { d.Date, d.AmountCents, Anon = d.MemberId == null }).ToListAsync(ct);

        var result = Enumerable.Range(1, 12).Select(month =>
        {
            var m = rows.Where(r => r.Date.Month == month).ToList();
            return new MonthlyIncomeRow(month, m.Count, m.Sum(r => r.AmountCents) / 100m,
                m.Count(r => r.Anon), m.Where(r => r.Anon).Sum(r => r.AmountCents) / 100m);
        }).ToList();
        return Result<IReadOnlyList<MonthlyIncomeRow>>.Ok(result);
    }

    public async Task<decimal> TotalAsync(DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var cents = await _donations.Query().AsNoTracking()
            .Where(d => d.IsActive && d.Date >= from && d.Date <= to)
            .SumAsync(d => (long?)d.AmountCents, ct) ?? 0;
        return cents / 100m;
    }

    private static DonationResponse ToResponse(Donation d) =>
        new(d.Id, d.Date, d.Amount, d.Concept, d.Method, d.MemberId, d.IsAnonymous, !d.IsActive);
}
