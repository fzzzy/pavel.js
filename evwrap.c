
#include <stdlib.h>
#include <stdio.h>
#include "evwrap.h"

struct ev_timer * new_timer(struct ev_loop * the_loop, void (*cb)(struct ev_loop *loop, struct ev_timer *watcher, int revents), double after) {
	struct ev_timer * the_timer = (ev_timer *)malloc(sizeof(ev_timer));
    ev_timer_init(the_timer, cb, (ev_tstamp)after, (ev_tstamp)0);
    ev_timer_start(the_loop, the_timer);
    printf("FOO!\n");
    return the_timer;
}

void free_timer(ev_timer *the_timer) {
    free(the_timer);
    printf("BAR!\n");
}


void simple_callback(void (*cb)()) {
    printf("HA\n");
    cb();
    printf("AH\n");
}
