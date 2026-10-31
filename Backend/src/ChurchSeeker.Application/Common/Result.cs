namespace ChurchSeeker.Application.Common;

public enum ErrorKind { None, Validation, NotFound, Forbidden, Conflict }

public sealed record Result<T>(T? Value, ErrorKind Error, IReadOnlyList<string> Messages)
{
    public bool Succeeded => Error == ErrorKind.None;
    public static Result<T> Ok(T value) => new(value, ErrorKind.None, []);
    public static Result<T> Fail(ErrorKind error, params string[] messages) => new(default, error, messages);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);
