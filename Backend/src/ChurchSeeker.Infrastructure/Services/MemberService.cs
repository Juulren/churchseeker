using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Members;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Services;

public sealed class MemberService : IMemberService
{
    private const int MaxSearchLength = 100;
    private readonly IRepository<Member> _repo;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;

    public MemberService(IRepository<Member> repo, ICurrentUser current, TimeProvider clock)
    {
        _repo = repo; _current = current; _clock = clock;
    }

    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    public async Task<Result<PagedResult<MemberResponse>>> ListAsync(MemberQuery q, CancellationToken ct = default)
    {
        var page = Math.Max(1, q.Page);
        var size = Math.Clamp(q.PageSize, 1, 100);
        var query = _repo.Query().AsNoTracking();

        if (q.Active is { } active)
            query = query.Where(m => m.IsActive == active);

        var search = q.Search?.Trim();
        if (!string.IsNullOrEmpty(search))
        {
            if (search.Length > MaxSearchLength)
                return Result<PagedResult<MemberResponse>>.Fail(ErrorKind.Validation, "Search is too long.");
            // Parameterised LIKE with wildcards in user input escaped so they match literally.
            var escaped = search.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
            query = query.Where(m => EF.Functions.Like(m.FullName, $"%{escaped}%", "\\"));
        }

        var total = await query.CountAsync(ct);
        var items = await query.OrderBy(m => m.FullName).ThenBy(m => m.Id)
            .Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return Result<PagedResult<MemberResponse>>.Ok(
            new PagedResult<MemberResponse>(items.Select(ToResponse).ToList(), page, size, total));
    }

    public async Task<Result<MemberResponse>> GetAsync(Guid id, CancellationToken ct = default)
    {
        // The tenant filter makes another church's member simply not exist (404, not 403).
        var m = await _repo.GetByIdAsync(id, ct);
        return m is null ? Result<MemberResponse>.Fail(ErrorKind.NotFound) : Result<MemberResponse>.Ok(ToResponse(m));
    }

    public async Task<Result<MemberResponse>> CreateAsync(MemberRequest r, CancellationToken ct = default)
    {
        if (_current.ChurchId is not { } churchId)
            return Result<MemberResponse>.Fail(ErrorKind.Forbidden);
        try
        {
            var member = new Member(churchId, r.FullName, r.Phone, r.Email, r.JoinDate, Today);
            await _repo.AddAsync(member, ct);
            await _repo.SaveChangesAsync(ct);
            return Result<MemberResponse>.Ok(ToResponse(member));
        }
        catch (DomainException ex)
        {
            return Result<MemberResponse>.Fail(ErrorKind.Validation, ex.Message);
        }
    }

    public async Task<Result<MemberResponse>> UpdateAsync(Guid id, MemberRequest r, CancellationToken ct = default)
    {
        var member = await _repo.GetByIdAsync(id, ct);
        if (member is null) return Result<MemberResponse>.Fail(ErrorKind.NotFound);
        try
        {
            member.Update(r.FullName, r.Phone, r.Email, r.JoinDate, Today);
            await _repo.SaveChangesAsync(ct);
            return Result<MemberResponse>.Ok(ToResponse(member));
        }
        catch (DomainException ex)
        {
            return Result<MemberResponse>.Fail(ErrorKind.Validation, ex.Message);
        }
    }

    public async Task<Result<MemberResponse>> SetActiveAsync(Guid id, bool active, CancellationToken ct = default)
    {
        var member = await _repo.GetByIdAsync(id, ct);
        if (member is null) return Result<MemberResponse>.Fail(ErrorKind.NotFound);
        if (active) member.Activate(); else member.Deactivate();
        await _repo.SaveChangesAsync(ct);
        return Result<MemberResponse>.Ok(ToResponse(member));
    }

    private static MemberResponse ToResponse(Member m) =>
        new(m.Id, m.FullName, m.Phone, m.Email, m.JoinDate, m.IsActive);
}
