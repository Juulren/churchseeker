using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChurchSeeker.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ChurchAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ChurchId",
                table: "RefreshTokens",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UserChurchAccess",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChurchId = table.Column<Guid>(type: "uuid", nullable: false),
                    GrantedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserChurchAccess", x => new { x.UserId, x.ChurchId });
                    table.ForeignKey(
                        name: "FK_UserChurchAccess_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserChurchAccess_Churches_ChurchId",
                        column: x => x.ChurchId,
                        principalTable: "Churches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserChurchAccess_ChurchId",
                table: "UserChurchAccess",
                column: "ChurchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserChurchAccess");

            migrationBuilder.DropColumn(
                name: "ChurchId",
                table: "RefreshTokens");
        }
    }
}
