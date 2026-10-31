using ChurchSeeker.Application.Donations;
using ChurchSeeker.Domain.Enums;
using ChurchSeeker.WebAPI.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

// Income data: Tesorero and Administrador only. Everyone else gets 403 before any code runs.
[Route("api/donations")]
[Authorize(Policy = Policies.Finance)]
public class DonationsController : ApiControllerBase
{
    private readonly IDonationService _donations;

    public DonationsController(IDonationService donations) => _donations = donations;

    [HttpPost]
    public async Task<IActionResult> Create(DonationRequest request, CancellationToken ct) =>
        Map(await _donations.CreateAsync(request, ct), d => CreatedAtAction(nameof(Get), new { id = d.Id }, d));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Map(await _donations.GetAsync(id, ct));

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, [FromQuery] DonationMethod? method,
        [FromQuery] bool? anonymous, [FromQuery] bool includeVoided = false,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default) =>
        Map(await _donations.ListAsync(new DonationQuery(from, to, method, anonymous, includeVoided, page, pageSize), ct));

    // Records are never edited or deleted: a wrong entry is voided and captured again.
    [HttpPost("{id:guid}/void")]
    public async Task<IActionResult> Void(Guid id, CancellationToken ct) => Map(await _donations.VoidAsync(id, ct));

    [HttpGet("summary/monthly")]
    public async Task<IActionResult> Monthly([FromQuery] int year, CancellationToken ct) =>
        Map(await _donations.MonthlySummaryAsync(year, ct));
}
