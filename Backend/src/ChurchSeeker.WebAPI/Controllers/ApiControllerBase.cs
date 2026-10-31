using ChurchSeeker.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace ChurchSeeker.WebAPI.Controllers;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected IActionResult Map<T>(Result<T> result, Func<T, IActionResult>? ok = null) => result.Error switch
    {
        ErrorKind.None => ok is null ? Ok(result.Value) : ok(result.Value!),
        ErrorKind.NotFound => NotFound(),
        ErrorKind.Forbidden => Problem("Forbidden.", statusCode: StatusCodes.Status403Forbidden),
        ErrorKind.Conflict => Problem(string.Join(" ", result.Messages), statusCode: StatusCodes.Status409Conflict),
        _ => BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["errors"] = result.Messages.ToArray() }))
    };
}
