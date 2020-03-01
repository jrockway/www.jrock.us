"use strict";

var nextid = 0;
var lastUpdated = new Array();

function updateLastUpdated() {
    var len = lastUpdated.length;
    var now = Date.now();
    var diff = 0;
    var id = 0;
    for(var i = 0; i < len-1; i++) {
        diff = now - lastUpdated[i];
        id = i * 3;
        if (diff > 0 && diff < 10000) {
            $(`#times tr:eq(${id})`).addClass("new");
            $(`#times tr:eq(${id})`).removeClass("old");
        } else if (diff > 60000 || diff < 0) {
            $(`#times tr:eq(${id})`).removeClass("new");
            $(`#times tr:eq(${id})`).addClass("old");
        } else {
            $(`#times tr:eq(${id})`).removeClass("old");
            $(`#times tr:eq(${id})`).removeClass("new");
        }
    }
    diff = now - lastUpdated[len-1];
    if (diff > 0 && diff < 30000) {
        $("#status").addClass("new");
        $("#status").removeClass("old");
    } else if (diff > 60000 || diff < 0) {
        $("#status").removeClass("new");
        $("#status").addClass("old");
    } else {
        $("#status").removeClass("new");
        $("#status").removeClass("old");
    }
}

function drawTime(data, status, xhr) {
    var id = xhr.id;
    $(`#times tr:eq(${3*id})`).html(`<td colspan=2 class="station">${data.stationName}</td>`);
    $(`#times tr:eq(${3*id+1})`).html(`<td>${data.direction1.name}</td><td>${data.direction1.times.map(time => `<span class="route route-${time.route}">${time.route}</span> ${time.minutes}`).join(" ")}</td>`);
    $(`#times tr:eq(${3*id+2})`).html(`<td>${data.direction2.name}</td><td>${data.direction2.times.map(time => `<span class="route route-${time.route}">${time.route}</span> ${time.minutes}`).join(" ")}</td>`);
    lastUpdated[id] = new Date(data.lastUpdatedOn*1000);
}

function drawTimeError(xhr, status, error) {
    var id = xhr.id;
    if ($(`#times tr:eq(${3*id})`).html() == "") {
        $(`#times tr:eq(${3*id})`).html(`<td colspan=2 class="station">unknown</td>`);
        $(`#times tr:eq(${3*id+1})`).html(`<td>${status}</td><td></td>`);
        $(`#times tr:eq(${3*id+2})`).html(`<td>${error}</td><td></td>`);
    } else {
        lastUpdated[id] = new Date(0);
    }
}

function request(url, first) {
    if (first) {
        $("#times").append("<tr></tr><tr></tr><tr></tr>");
    }
    $.ajax({
        dataType: "json",
        url: url,
        success: drawTime,
        error: drawTimeError,
        timeout: 4500,
    })["id"] = nextid;
    nextid++;
}

function drawStatus(data, st, xhr) {
    $("#status").html("");
    var routes = data.routeDetails.filter(route => route.mode == "subway");
    routes = routes.sort((a, b) => a.route[0] < b.route[0] ? -1 : a.route[0] == b.route[0] ? 0 : 1);
    for (var route of routes) {
        var name = route.route;
        var color = route.color;
        if (route.statusDetails !== undefined) {
            $("#status").append(`<span style="color: #${color};">${name}</span>&nbsp;`);
            var last = "";
            for (var status of route.statusDetails) {
                if (status.statusSummary != last) {
                    $("#status").append(`${status.statusSummary} `);
                    last = status.statusSummary;
                }
            }
        }
    }
    lastUpdated[xhr.id] = new Date(data.lastUpdated);
}

function drawStatusError(xhr, status, error) {
    if ($("#status").html() == "") {
        $("#status").html(`Loading status: ${status} (${error})`);
    } else {
        lastUpdated[xhr.id] = new Date(0);
    }
}

function status(url) {
    $.ajax({
        dataType: "json",
        url: url,
        success: drawStatus,
        error: drawStatusError,
        timeout: 4500,
    })["id"] = nextid;
    nextid++;
}

function load(first) {
    nextid = 0;
    request("https://mtasubwaytime.info/getTime/2/231", first);
    request("https://mtasubwaytime.info/getTime/2/137", first);
    request("https://mtasubwaytime.info/getTime/2/134", first);
    request("https://mtasubwaytime.info/getTime/C/A33", first);
    request("https://mtasubwaytime.info/getTime/C/A34", first);
    request("https://mtasubwaytime.info/getTime/C/A40", first);

    status("https://collector-otp-prod.camsys-apps.com/realtime/serviceStatus?apikey=qeqy84JE7hUKfaI0Lxm2Ttcm6ZA0bYrP");

    if (first) {
        window.setInterval(updateLastUpdated, 1000);
    }
    window.setTimeout(() => load(false), 5000);
}
