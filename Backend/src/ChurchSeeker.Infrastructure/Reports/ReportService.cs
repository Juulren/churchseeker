using System.Globalization;
using ChurchSeeker.Application.Auth;
using ChurchSeeker.Application.Common;
using ChurchSeeker.Application.Reports;
using ChurchSeeker.Domain.Entities;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ChurchSeeker.Infrastructure.Reports;

public sealed class ReportService : IReportService
{
    private const int MaxRows = 10_000;
    private const int MaxEventRangeDays = 366;
    private const int MaxIncomeRangeDays = 366 * 3;
    private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

    private readonly IRepository<Member> _members;
    private readonly IRepository<ChurchEvent> _events;
    private readonly IRepository<Attendance> _attendance;
    private readonly IRepository<Ministry> _ministries;
    private readonly IRepository<MinistryMember> _links;
    private readonly IRepository<Donation> _donations;
    private readonly IRepository<Church> _churches;
    private readonly UserManager<ApplicationUser> _users;
    private readonly ICurrentUser _current;
    private readonly TimeProvider _clock;

    public ReportService(IRepository<Member> members, IRepository<ChurchEvent> events, IRepository<Attendance> attendance,
                         IRepository<Ministry> ministries, IRepository<MinistryMember> links, IRepository<Donation> donations,
                         IRepository<Church> churches, UserManager<ApplicationUser> users, ICurrentUser current, TimeProvider clock)
    {
        _members = members; _events = events; _attendance = attendance; _ministries = ministries; _links = links;
        _donations = donations; _churches = churches; _users = users; _current = current; _clock = clock;
    }

    private DateOnly Today => DateOnly.FromDateTime(_clock.GetUtcNow().UtcDateTime);

    public async Task<Result<ReportTable>> BuildAsync(ReportKind kind, ReportQuery q, CancellationToken ct = default)
    {
        // Defence in depth: the controller already restricts routes, the service re-checks the verified role.
        var role = _current.Role;
        var allowed = kind == ReportKind.Income
            ? role is UserRole.Tesorero or UserRole.Administrador
            : role is UserRole.Administrador or UserRole.Pastor or UserRole.Secretario;
        if (!allowed || _current.ChurchId is not { } churchId) return Result<ReportTable>.Fail(ErrorKind.Forbidden);

        var church = await _churches.Query().AsNoTracking().FirstOrDefaultAsync(c => c.Id == churchId, ct);
        var prefix = $"{church?.Name ?? "Iglesia"} · generado {Today:yyyy-MM-dd}";

        return kind switch
        {
            ReportKind.Members => await MembersAsync(q, prefix, ct),
            ReportKind.Attendance => await AttendanceAsync(q, prefix, ct),
            ReportKind.Ministries => await MinistriesAsync(prefix, ct),
            ReportKind.Income => await IncomeAsync(q, prefix, ct),
            _ => Result<ReportTable>.Fail(ErrorKind.Validation, "Unknown report.")
        };
    }

    private async Task<Result<ReportTable>> MembersAsync(ReportQuery q, string prefix, CancellationToken ct)
    {
        var query = _members.Query().AsNoTracking();
        if (q.Active is { } active) query = query.Where(m => m.IsActive == active);
        var rows = await query.OrderBy(m => m.FullName).ThenBy(m => m.Id).Take(MaxRows).ToListAsync(ct);
        var filter = q.Active is null ? "todos" : q.Active.Value ? "activos" : "inactivos";
        return Result<ReportTable>.Ok(new ReportTable(
            "Reporte de miembros", $"{prefix} · {filter}",
            ["Nombre", "Teléfono", "Correo", "Fecha de ingreso", "Estado"],
            rows.Select(m => (IReadOnlyList<string>)[m.FullName, m.Phone ?? "", m.Email ?? "", m.JoinDate.ToString("yyyy-MM-dd"), m.IsActive ? "Activo" : "Inactivo"]).ToList(),
            [$"Total: {rows.Count}"], []));
    }

    private async Task<Result<ReportTable>> AttendanceAsync(ReportQuery q, string prefix, CancellationToken ct)
    {
        if (q.EventId is { } eventId)
        {
            var ev = await _events.Query().AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
            if (ev is null) return Result<ReportTable>.Fail(ErrorKind.NotFound);
            var marks = await (from a in _attendance.Query().AsNoTracking()
                               where a.EventId == eventId
                               join m in _members.Query().AsNoTracking() on a.MemberId equals m.Id
                               orderby m.FullName, m.Id
                               select new { m.FullName, a.Present }).Take(MaxRows).ToListAsync(ct);
            return Result<ReportTable>.Ok(new ReportTable(
                $"Asistencia: {ev.Title}", $"{prefix} · {ev.Date:yyyy-MM-dd} {ev.Time:HH:mm}",
                ["Miembro", "Asistencia"],
                marks.Select(x => (IReadOnlyList<string>)[x.FullName, x.Present ? "Presente" : "Ausente"]).ToList(),
                [$"Presentes: {marks.Count(x => x.Present)}", $"Ausentes: {marks.Count(x => !x.Present)}"], []));
        }

        if (q.From is not { } from || q.To is not { } to || to < from || to.DayNumber - from.DayNumber > MaxEventRangeDays)
            return Result<ReportTable>.Fail(ErrorKind.Validation, "Provide from and to (max 366 days apart) or an eventId.");

        var events = await _events.Query().AsNoTracking().Where(e => e.Date >= from && e.Date <= to)
            .OrderBy(e => e.Date).ThenBy(e => e.Time).Take(MaxRows).Select(e => new { e.Id, e.Date, e.Title, e.IsCancelled }).ToListAsync(ct);
        var ids = events.Select(e => e.Id).ToList();
        var counts = await _attendance.Query().AsNoTracking().Where(a => ids.Contains(a.EventId))
            .GroupBy(a => new { a.EventId, a.Present }).Select(g => new { g.Key.EventId, g.Key.Present, N = g.Count() }).ToListAsync(ct);
        int Count(Guid id, bool present) => counts.Where(c => c.EventId == id && c.Present == present).Sum(c => c.N);

        return Result<ReportTable>.Ok(new ReportTable(
            "Asistencia por evento", $"{prefix} · {from:yyyy-MM-dd} a {to:yyyy-MM-dd}",
            ["Fecha", "Evento", "Presentes", "Ausentes", "Total"],
            events.Select(e => (IReadOnlyList<string>)[e.Date.ToString("yyyy-MM-dd"), e.IsCancelled ? $"{e.Title} (cancelado)" : e.Title,
                Count(e.Id, true).ToString(Inv), Count(e.Id, false).ToString(Inv), (Count(e.Id, true) + Count(e.Id, false)).ToString(Inv)]).ToList(),
            [$"Eventos: {events.Count}", $"Asistencias registradas (presentes): {events.Sum(e => Count(e.Id, true))}"], [2, 3, 4]));
    }

    private async Task<Result<ReportTable>> MinistriesAsync(string prefix, CancellationToken ct)
    {
        var today = Today;
        var rows = await _ministries.Query().AsNoTracking().Where(m => m.IsActive).OrderBy(m => m.Name).Take(MaxRows)
            .Select(m => new
            {
                m.Name, m.CoordinatorUserId,
                Members = _links.Query().Count(l => l.MinistryId == m.Id && l.IsActive),
                Upcoming = _events.Query().Count(e => e.MinistryId == m.Id && !e.IsCancelled && e.Date >= today && e.Date <= today.AddDays(90))
            }).ToListAsync(ct);

        var table = new List<IReadOnlyList<string>>();
        foreach (var r in rows)
        {
            var coordinator = r.CoordinatorUserId is { } uid ? (await _users.FindByIdAsync(uid.ToString()))?.FullName : null;
            table.Add([r.Name, coordinator ?? "—", r.Members.ToString(Inv), r.Upcoming.ToString(Inv)]);
        }
        return Result<ReportTable>.Ok(new ReportTable(
            "Participación por ministerio", $"{prefix} · actividades de los próximos 90 días",
            ["Ministerio", "Coordinador", "Integrantes", "Actividades programadas"], table,
            [$"Ministerios activos: {rows.Count}", $"Integrantes (con repeticiones): {rows.Sum(r => r.Members)}"], [2, 3]));
    }

    private async Task<Result<ReportTable>> IncomeAsync(ReportQuery q, string prefix, CancellationToken ct)
    {
        if (q.From is not { } from || q.To is not { } to || to < from || to.DayNumber - from.DayNumber > MaxIncomeRangeDays)
            return Result<ReportTable>.Fail(ErrorKind.Validation, "Provide from and to (max 3 years apart).");

        // Aggregated by month: the report never lists donors, so identified donations stay private.
        var data = await _donations.Query().AsNoTracking().Where(d => d.IsActive && d.Date >= from && d.Date <= to)
            .Select(d => new { d.Date, d.AmountCents, Anon = d.MemberId == null }).ToListAsync(ct);

        var rows = new List<IReadOnlyList<string>>();
        for (var month = new DateOnly(from.Year, from.Month, 1); month <= to; month = month.AddMonths(1))
        {
            var m = data.Where(d => d.Date.Year == month.Year && d.Date.Month == month.Month).ToList();
            rows.Add([month.ToString("yyyy-MM"), m.Count.ToString(Inv), Money(m.Sum(d => d.AmountCents)),
                m.Count(d => d.Anon).ToString(Inv), Money(m.Where(d => d.Anon).Sum(d => d.AmountCents))]);
        }
        return Result<ReportTable>.Ok(new ReportTable(
            "Ingresos por periodo", $"{prefix} · {from:yyyy-MM-dd} a {to:yyyy-MM-dd}",
            ["Mes", "Donaciones", "Total", "Anónimas", "Total anónimas"], rows,
            [$"Total general: {Money(data.Sum(d => d.AmountCents))}", $"Donaciones: {data.Count}"], [1, 2, 3, 4]));
    }

    private static string Money(long cents) => (cents / 100m).ToString("0.00", Inv);
}
