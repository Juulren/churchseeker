using ChurchSeeker.Application.Dashboard;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

[Route("api/dashboard")]
[Authorize]
public class DashboardController : ApiControllerBase
{
    private readonly IDashboardService _dashboard;

    public DashboardController(IDashboardService dashboard) => _dashboard = dashboard;

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct) => Map(await _dashboard.GetAsync(ct));
}
